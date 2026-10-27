'use client'

// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// オートメーションの指示文の入力欄。`@` でメンバー・属性・プロジェクトの役割、`#` でチャンネルを選ぶと、
// 名前ではなく ID の参照（`<@id>`・`<@attr:id>`・`<@role:id>`・`<#id>`）として入れる（ai-automation-design.md §4）。
// 保存後は名前で推測し直さないので、同名や改名で誤解釈しない。

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '@/components/locale-provider'
import { useProfileAttributes } from '@/hooks/use-profile-attributes'
import { useProjectRoles } from '@/hooks/use-project-roles'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

type Candidate = { token: string; label: string; kind: 'member' | 'attribute' | 'role' | 'channel' }

const TRIGGER_RE = /(^|\s)([@#])([^\s@#<>]*)$/
const REFERENCE_RE = /<@([^|>\s]+)\|([^>\n]*)>|<#([0-9a-f-]{36})\|([^>\n]*)>|<@([^|>\s]+)>|<#([0-9a-f-]{36})>/gi

/** カーソル直前の `@名前` / `#名前` を見つける（入力中の候補を出すため） */
export function referenceTrigger(text: string, caret: number): { symbol: '@' | '#'; query: string; start: number } | null {
  const match = TRIGGER_RE.exec(text.slice(0, caret))
  if (!match) return null
  return { symbol: match[2] as '@' | '#', query: match[3] ?? '', start: caret - (match[3] ?? '').length - 1 }
}

async function fetchItems<T>(url: string): Promise<T[]> {
  const response = await fetchWithAuth(url)
  if (!response.ok) throw new Error('候補を取得できませんでした')
  const body = (await response.json()) as { items?: T[] }
  return body.items ?? []
}

function useReferenceCandidates(enabled: boolean) {
  const members = useQuery({
    queryKey: ['instruction-reference-members'],
    queryFn: () => fetchItems<{ userId: string; name: string }>('/api/research/members?limit=200'),
    enabled,
  })
  const channels = useQuery({
    queryKey: ['instruction-reference-channels'],
    queryFn: () => fetchItems<{ id: string; name: string; parentChannelId: string | null }>('/api/research/channels?limit=200'),
    enabled,
  })
  const { data: attributes = [] } = useProfileAttributes(enabled)
  const { data: roles = [] } = useProjectRoles()
  return {
    members: members.data ?? [],
    channels: channels.data ?? [],
    attributes,
    roles,
    error: members.error ?? channels.error,
  }
}

/** 参照を `@名前` / `#名前` の文字にする（1行の要約用） */
export function instructionToPlainText(text: string): string {
  return text.replace(REFERENCE_RE, (_full, _id, name?: string, _channelId?: string, channelName?: string) =>
    channelName !== undefined ? `#${channelName}` : `@${name ?? '…'}`)
}

/** 参照を `@名前` / `#名前` の見た目で描く（入力欄の下のプレビュー） */
export function InstructionPreview({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(REFERENCE_RE)) {
    const index = match.index ?? 0
    if (index > last) parts.push(text.slice(last, index))
    const isChannel = match[3] !== undefined || match[6] !== undefined
    const name = match[2] ?? match[4] ?? null
    parts.push(
      <span key={index} style={{ padding: '0 4px', borderRadius: 4, background: 'var(--accent-soft)', color: 'var(--accent-text)', fontWeight: 600 }}>
        {isChannel ? '#' : '@'}{name ?? '…'}
      </span>,
    )
    last = index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 13 }}>{parts}</div>
}

export function InstructionEditor({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const t = useT()
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const [trigger, setTrigger] = React.useState<ReturnType<typeof referenceTrigger>>(null)
  const data = useReferenceCandidates(true)

  const candidates: Candidate[] = React.useMemo(() => {
    if (!trigger) return []
    const q = trigger.query.toLowerCase()
    if (trigger.symbol === '#') {
      return data.channels
        .filter(channel => channel.name.toLowerCase().includes(q))
        .map(channel => ({ token: `<#${channel.id}|${channel.name}>`, label: channel.name, kind: 'channel' as const }))
        .slice(0, 8)
    }
    return [
      ...data.members.filter(member => member.name.toLowerCase().includes(q)).map(member => ({ token: `<@${member.userId}|${member.name}>`, label: member.name, kind: 'member' as const })),
      ...data.roles.filter(role => role.name.toLowerCase().includes(q)).map(role => ({ token: `<@role:${role.id}|${role.name}>`, label: role.name, kind: 'role' as const })),
      ...data.attributes.filter(attribute => attribute.name.toLowerCase().includes(q)).map(attribute => ({ token: `<@attr:${attribute.id}|${attribute.name}>`, label: attribute.name, kind: 'attribute' as const })),
    ].slice(0, 8)
  }, [trigger, data.channels, data.members, data.roles, data.attributes])

  const update = (text: string, caret: number) => {
    onChange(text)
    setTrigger(referenceTrigger(text, caret))
  }
  const insert = (candidate: Candidate) => {
    if (!trigger) return
    const caret = ref.current?.selectionStart ?? value.length
    const next = `${value.slice(0, trigger.start)}${candidate.token} ${value.slice(caret)}`
    onChange(next)
    setTrigger(null)
    const position = trigger.start + candidate.token.length + 1
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(position, position)
    })
  }
  const kindLabel = (kind: Candidate['kind']) =>
    kind === 'member' ? t('Member') : kind === 'role' ? t('Project role') : kind === 'attribute' ? t('Attribute') : t('Channel')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <textarea
        ref={ref}
        name="automationInstruction"
        className="form-control"
        rows={6}
        maxLength={10000}
        placeholder={placeholder}
        value={value}
        onChange={event => update(event.target.value, event.target.selectionStart)}
        onKeyUp={event => setTrigger(referenceTrigger(event.currentTarget.value, event.currentTarget.selectionStart))}
        onBlur={() => setTimeout(() => setTrigger(null), 150)}
        style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
      />
      {trigger && (
        <div role="listbox" aria-label={t('References')} style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          {data.error ? (
            <div role="alert" style={{ padding: '8px 12px', fontSize: 12, color: 'var(--red-text)' }}>{data.error.message}</div>
          ) : candidates.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-4)' }}>{t('No matches')}</div>
          ) : candidates.map(candidate => (
            <button
              key={candidate.token}
              type="button"
              role="option"
              aria-selected={false}
              className="hover-bg"
              onMouseDown={event => { event.preventDefault(); insert(candidate) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 13 }}
            >
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{candidate.kind === 'channel' ? '#' : '@'}{candidate.label}</span>
              <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{kindLabel(candidate.kind)}</span>
            </button>
          ))}
        </div>
      )}
      <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>
        {t('Type @ for members, attributes, and project roles, or # for channels. Picked items are saved by ID, so renames and duplicate names do not change their meaning.')}
      </span>
      {/<[@#]/.test(value) && (
        <div style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }}>
          <InstructionPreview text={value}/>
        </div>
      )}
    </div>
  )
}
