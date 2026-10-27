// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import type { ToolInvocation } from 'ai'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PendingActionDto } from '@/lib/ai/pending-actions'
import { useT } from '@/components/locale-provider'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { Icon } from './primitives'
import { MarkdownContent } from './markdown-content'

/** AI の tool 結果から、承認カードを出す実行案の ID を拾う（propose_* tool が返す pendingAction.id） */
export function pendingActionIdsFromTools(toolInvocations: ToolInvocation[] | undefined): string[] {
  const ids: string[] = []
  for (const invocation of toolInvocations ?? []) {
    if (invocation.state !== 'result' || !invocation.toolName.startsWith('propose_')) continue
    const result = invocation.result as { ok?: unknown; pendingAction?: { id?: unknown } } | null
    if (result?.ok === true && typeof result.pendingAction?.id === 'string') ids.push(result.pendingAction.id)
  }
  return ids
}

async function readJson(response: Response): Promise<PendingActionDto> {
  const body = (await response.json().catch(() => null)) as (PendingActionDto & { error?: string }) | null
  if (!response.ok || !body) throw new Error(body?.error ?? `HTTP ${response.status}`)
  return body
}

const queryKey = (id: string) => ['ai-pending-action', id] as const

export function PendingActionCards({ toolInvocations }: { toolInvocations: ToolInvocation[] | undefined }) {
  const ids = pendingActionIdsFromTools(toolInvocations)
  if (ids.length === 0) return null
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ids.map(id => <PendingActionCard key={id} id={id}/>)}
    </div>
  )
}

function PendingActionCard({ id }: { id: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { data: action, error: loadError, isLoading } = useQuery<PendingActionDto>({
    queryKey: queryKey(id),
    queryFn: async () => readJson(await fetchWithAuth(`/api/ai/pending-actions/${encodeURIComponent(id)}`)),
  })
  const [draft, setDraft] = React.useState<Record<string, string>>({})
  const [editing, setEditing] = React.useState(false)
  const decide = useMutation({
    mutationFn: async (decision: 'approve' | 'reject') => {
      const edits = decision === 'approve' && action ? editsFrom(action, draft) : undefined
      return readJson(await fetchWithAuth(`/api/ai/pending-actions/${encodeURIComponent(id)}/${decision}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(edits ? { edits } : {}),
      }))
    },
    onSuccess: (updated) => queryClient.setQueryData(queryKey(id), updated),
  })

  const cardStyle: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }
  if (isLoading) return <div style={cardStyle}><span style={{ color: 'var(--text-3)' }}>{t('Loading…')}</span></div>
  if (loadError || !action) {
    return <div style={cardStyle} role="alert"><span style={{ color: 'var(--red)' }}>{t('Could not load the proposed action')}: {loadError instanceof Error ? loadError.message : ''}</span></div>
  }

  const pending = action.status === 'pending'
  const field = (key: string) => draft[key] ?? (typeof action.payload[key] === 'string' ? action.payload[key] as string : '')
  return (
    <div style={cardStyle} data-testid="ai-pending-action-card" data-status={action.status}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
        <Icon name="sparkles" size={13} color="var(--accent)"/>
        {actionTitle(action, t)}
        <StatusBadge status={action.status}/>
      </div>
      <ActionDetails action={action}/>
      {action.reason && <div style={{ color: 'var(--text-3)', fontSize: 12 }}>{t('Reason')}: {action.reason}</div>}
      {action.actionType === 'post_message' && !editing && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--bg)' }}>
          <MarkdownContent content={field('text')} mentionNames={new Map(Object.entries(action.display.mentionNames ?? {}))}/>
        </div>
      )}
      {pending && (editing || action.actionType !== 'post_message') && action.editableFields.map(key => (
        <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-3)' }}>
          {fieldLabel(key, t)}
          {key === 'title' ? (
            <input className="form-control" value={field(key)} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}/>
          ) : (
            <textarea className="form-control" rows={key === 'text' ? 5 : 3} value={field(key)} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} style={{ resize: 'vertical', fontFamily: 'inherit' }}/>
          )}
        </label>
      ))}
      {pending && editing && action.actionType === 'post_message' && (
        <div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{t('Mentions are written as <@member ID>. Keep them as they are to notify the member.')}</div>
      )}
      {action.error && <div role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>{action.error}</div>}
      {decide.error && <div role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>{decide.error instanceof Error ? decide.error.message : String(decide.error)}</div>}
      {pending && (
        <>
          <div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>
            {action.actionType === 'post_message'
              ? t('Cairn AI will post this with your name as the approver. Only you can see this card.')
              : t('This runs with your permissions when you approve it. Only you can see this card.')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={decide.isPending} onClick={() => decide.mutate('approve')}>
              {t('Approve and run')}
            </button>
            {action.actionType === 'post_message' && (
              <button className="btn btn-ghost" disabled={decide.isPending} onClick={() => setEditing(value => !value)}>
                {editing ? t('Preview') : t('Edit')}
              </button>
            )}
            <button className="btn btn-ghost" disabled={decide.isPending} onClick={() => decide.mutate('reject')} style={{ marginLeft: 'auto' }}>
              {t('Reject')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function editsFrom(action: PendingActionDto, draft: Record<string, string>): Record<string, string> | undefined {
  const edits = Object.fromEntries(
    Object.entries(draft).filter(([key, value]) => action.editableFields.includes(key) && value !== action.payload[key]),
  )
  return Object.keys(edits).length > 0 ? edits : undefined
}

type T = ReturnType<typeof useT>

function actionTitle(action: PendingActionDto, t: T): string {
  switch (action.actionType) {
    case 'post_message':
      return t('Post to a channel')
    case 'invite_project_member':
      return t('Add a member to the project')
    case 'set_project_member_role':
      return t('Change a project role')
    case 'create_task':
      return t('Create a task')
  }
}

function fieldLabel(key: string, t: T): string {
  if (key === 'text') return t('Message')
  if (key === 'title') return t('Title')
  return t('Description')
}

function StatusBadge({ status }: { status: PendingActionDto['status'] }) {
  const t = useT()
  if (status === 'pending') return null
  const labels: Record<Exclude<PendingActionDto['status'], 'pending'>, string> = {
    executing: t('Running…'),
    executed: t('Done'),
    failed: t('Failed'),
    rejected: t('Rejected'),
    expired: t('Expired'),
  }
  const color = status === 'executed' ? 'var(--green)' : status === 'failed' ? 'var(--red)' : 'var(--text-3)'
  return <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color }}>{labels[status]}</span>
}

function ActionDetails({ action }: { action: PendingActionDto }) {
  const t = useT()
  const missing = t('Not found or not accessible')
  const rows: Array<[string, string]> = []
  const { display, payload } = action
  if ('channel' in display) rows.push([t('Channel'), display.channel ? `#${display.channel.name}` : missing])
  if ('project' in display) rows.push([t('Project'), display.project?.title ?? missing])
  if ('user' in display) rows.push([t('Member'), display.user?.name ?? missing])
  if ('role' in display) rows.push([t('Project role'), display.role?.name ?? missing])
  if ('assignee' in display) rows.push([t('Assignee'), display.assignee?.name ?? missing])
  if (action.actionType === 'create_task') {
    if (typeof payload['dueDate'] === 'string') rows.push([t('Due date'), payload['dueDate']])
    if (action.status !== 'pending') rows.push([t('Title'), String(payload['title'] ?? '')])
  }
  if (action.actionType === 'invite_project_member' && !('role' in display)) rows.push([t('Project role'), t('Member')])
  if (rows.length === 0) return null
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', fontSize: 12.5 }}>
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
          <dd style={{ margin: 0, color: 'var(--text)' }}>{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}
