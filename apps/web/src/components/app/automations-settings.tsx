'use client'

// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import type { AutomationDto, AutomationWriteAction } from '@/lib/ai/automations'
import { useT } from '@/components/locale-provider'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import {
  useAutomations,
  useCreateAutomation,
  useDeleteAutomation,
  useUpdateAutomation,
  type AutomationInput,
} from '@/hooks/use-automations'
import { ConfirmDialog } from './confirm-dialog'
import { RowActionMenu } from './row-action-menu'

// 画面の並び順と表示名。サーバーの AUTOMATION_WRITE_ACTIONS と同じ4種類
const WRITE_ACTION_OPTIONS: Array<{ id: AutomationWriteAction; label: string }> = [
  { id: 'post_message', label: 'Post to a channel (with mentions)' },
  { id: 'invite_project_member', label: 'Add members to a project' },
  { id: 'set_project_member_role', label: 'Change project roles' },
  { id: 'create_task', label: 'Create tasks' },
]

const EMPTY_INPUT: AutomationInput = { name: '', instruction: '', writeActions: [] }

function AutomationForm({
  initial,
  pending,
  error,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: AutomationInput
  pending: boolean
  error: Error | null
  submitLabel: string
  onSubmit: (input: AutomationInput) => void
  onCancel: () => void
}) {
  const t = useT()
  const [input, setInput] = React.useState(initial)
  const toggle = (action: AutomationWriteAction) => setInput(current => ({
    ...current,
    writeActions: current.writeActions.includes(action)
      ? current.writeActions.filter(value => value !== action)
      : [...current.writeActions, action],
  }))
  return (
    <div style={{ padding: 16, background: 'var(--card-2)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600 }}>
        {t('Skill name')}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span aria-hidden="true" style={{ color: 'var(--text-3)', fontWeight: 700 }}>$</span>
          <input
            name="automationName"
            autoComplete="off"
            className="form-control"
            placeholder="assign-reviewer"
            value={input.name}
            maxLength={40}
            onChange={event => setInput(current => ({ ...current, name: event.target.value.toLowerCase() }))}
            style={{ flex: 1 }}
          />
        </div>
        <span style={{ fontWeight: 400, color: 'var(--text-4)' }}>{t('Lowercase letters, numbers, and hyphens. Members call it as ${name} in the AI assistant.', { name: input.name || 'assign-reviewer' })}</span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600 }}>
        {t('Instructions')}
        <textarea
          name="automationInstruction"
          className="form-control"
          rows={6}
          maxLength={10000}
          placeholder={t('e.g. Read the plan attached to this project, invite coaches who reviewed similar plans before as reviewers, and mention them.')}
          value={input.instruction}
          onChange={event => setInput(current => ({ ...current, instruction: event.target.value }))}
          style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
        />
      </label>
      <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <legend style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{t('What it may do after approval')}</legend>
        {WRITE_ACTION_OPTIONS.map(option => (
          <label key={option.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={input.writeActions.includes(option.id)} onChange={() => toggle(option.id)}/>
            {t(option.label)}
          </label>
        ))}
        <span style={{ fontSize: 12, color: 'var(--text-4)' }}>
          {t('Leave everything unchecked for a read-only skill. Each write is shown as an approval card and runs only after the caller approves it.')}
        </span>
      </fieldset>
      <p role="note" style={{ margin: 0, padding: '8px 10px', borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
        {t('The name, instructions, allowed actions, and creator are visible to every member. If the instructions evaluate or report on people, members can see that too.')}
      </p>
      {error && <p role="alert" style={{ margin: 0, color: 'var(--red-text)', fontSize: 12 }}>{error.message}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn" onClick={onCancel}>{t('Cancel')}</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !input.name.trim() || !input.instruction.trim()}
          onClick={() => onSubmit({ ...input, name: input.name.trim(), instruction: input.instruction.trim() })}
        >
          {pending ? t('Saving...') : submitLabel}
        </button>
      </div>
    </div>
  )
}

function AutomationRow({ automation, canManage }: { automation: AutomationDto; canManage: boolean }) {
  const t = useT()
  const [editing, setEditing] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const update = useUpdateAutomation(automation.id)
  const remove = useDeleteAutomation(automation.id)

  if (editing) {
    return (
      <AutomationForm
        initial={{ name: automation.name, instruction: automation.instruction, writeActions: automation.writeActions }}
        pending={update.isPending}
        error={update.error}
        submitLabel={t('Save')}
        onSubmit={input => update.mutate(input, { onSuccess: () => setEditing(false) })}
        onCancel={() => { update.reset(); setEditing(false) }}
      />
    )
  }

  const writeLabels = WRITE_ACTION_OPTIONS.filter(option => automation.writeActions.includes(option.id)).map(option => t(option.label))
  return (
    <div style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }} data-testid="automation-row">
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>${automation.name}</span>
          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>{t('Skill')}</span>
          {!automation.enabled && (
            <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>{t('Paused')}</span>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{automation.instruction}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {t('Allowed after approval')}: {writeLabels.length > 0 ? writeLabels.join(t(', ')) : t('Read only')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-4)' }}>
          {t('Created by {name}', { name: automation.createdBy?.name ?? t('Unknown member') })}
        </div>
        {update.error && <p role="alert" style={{ margin: 0, color: 'var(--red-text)', fontSize: 12 }}>{update.error.message}</p>}
      </div>
      {canManage && (
        <RowActionMenu actions={[
          { icon: 'edit', label: 'Edit', onSelect: () => { update.reset(); setEditing(true) } },
          automation.enabled
            ? { icon: 'bell-off', label: 'Pause', onSelect: () => update.mutate({ enabled: false }) }
            : { icon: 'refresh', label: 'Resume', onSelect: () => update.mutate({ enabled: true }) },
          { icon: 'trash', label: 'Delete', danger: true, onSelect: () => setConfirmDelete(true) },
        ]} />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={t('Delete automation')}
        message={t('Delete ${name}. Its run records are kept for auditing.', { name: automation.name })}
        onConfirm={() => remove.mutateAsync()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}

export function AutomationsSettings() {
  const t = useT()
  const { isAdmin } = useWorkspacePermissions()
  const { data: automations = [], isLoading, error } = useAutomations()
  const [adding, setAdding] = React.useState(false)
  const create = useCreateAutomation()

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>{t('AI automations')}</h1>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13, lineHeight: 1.6 }}>
            {t('Define skills that the AI runs from written instructions. Members call a skill as $name in the AI assistant, and any write runs only after the caller approves it.')}
          </p>
        </div>
        {isAdmin && !adding && (
          <button type="button" className="btn btn-primary" onClick={() => { create.reset(); setAdding(true) }} style={{ flexShrink: 0 }}>
            {t('Add skill')}
          </button>
        )}
      </div>
      <section>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {adding && (
            <div style={{ borderBottom: automations.length > 0 ? '1px solid var(--divider)' : 'none' }}>
              <AutomationForm
                initial={EMPTY_INPUT}
                pending={create.isPending}
                error={create.error}
                submitLabel={t('Add')}
                onSubmit={input => create.mutate(input, { onSuccess: () => setAdding(false) })}
                onCancel={() => { create.reset(); setAdding(false) }}
              />
            </div>
          )}
          {isLoading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>{t('Loading...')}</div>
          ) : error ? (
            <div role="alert" style={{ padding: 20, color: 'var(--red-text)', fontSize: 13 }}>{error.message}</div>
          ) : automations.length === 0 && !adding ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>{t('No automations yet.')}</div>
          ) : automations.map((automation, index) => (
            <div key={automation.id} style={{ borderBottom: index < automations.length - 1 ? '1px solid var(--divider)' : 'none' }}>
              <AutomationRow automation={automation} canManage={isAdmin} />
            </div>
          ))}
        </div>
        {!isAdmin && <p style={{ margin: '10px 0 0', color: 'var(--text-4)', fontSize: 12 }}>{t('Only admins can add, edit, pause, or delete automations.')}</p>}
      </section>
    </div>
  )
}
