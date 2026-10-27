'use client'

// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// オートメーションの指示文の入力欄。`@` でメンバー・属性・プロジェクトの役割、`#` でチャンネルを選ぶと、
// 名前ではなく ID の参照（`<@id>`・`<@attr:id>`・`<@role:id>`・`<#id>`）として入れる（ai-automation-design.md §4）。
// 保存後は名前で推測し直さないので、同名や改名で誤解釈しない。

import React from 'react'
import { useT } from '@/components/locale-provider'
import { useReferenceCandidates } from '@/hooks/use-instruction-reference-candidates'
import { sanitizeReferenceName } from '@/lib/ai/reference-name'

type Candidate = { token: string; label: string; kind: 'member' | 'attribute' | 'role' | 'channel' }

const TRIGGER_RE = /(^|\s)([@#])([^\s@#<>]*)$/
const REFERENCE_RE = /<@([^|>\s]+)\|([^>\n]*)>|<#([0-9a-f-]{36})\|([^>\n]*)>|<@([^|>\s]+)>|<#([0-9a-f-]{36})>/gi

/** カーソル直前の `@名前` / `#名前` を見つける（入力中の候補を出すため） */
export function referenceTrigger(text: string, caret: number): { symbol: '@' | '#'; query: string; start: number } | null {
  const match = TRIGGER_RE.exec(text.slice(0, caret))
  if (!match) return null
  return { symbol: match[2] as '@' | '#', query: match[3] ?? '', start: caret - (match[3] ?? '').length - 1 }
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

export function InstructionEditor({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  const t = useT()
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const pickerRef = React.useRef<HTMLDivElement>(null)
  const [trigger, setTrigger] = React.useState<ReturnType<typeof referenceTrigger>>(null)
  const data = useReferenceCandidates(trigger)

  const candidates: Candidate[] = React.useMemo(() => {
    if (!trigger) return []
    const q = trigger.query.toLowerCase()
    if (trigger.symbol === '#') {
      return data.channels
        .filter(channel => channel.name.toLowerCase().includes(q))
        .map(channel => ({ token: `<#${channel.id}|${sanitizeReferenceName(channel.name)}>`, label: channel.name, kind: 'channel' as const }))
        .slice(0, 8)
    }
    return [
      ...data.members.filter(member => member.name.toLowerCase().includes(q)).map(member => ({ token: `<@${member.userId}|${sanitizeReferenceName(member.name)}>`, label: member.name, kind: 'member' as const })),
      ...data.roles.filter(role => role.name.toLowerCase().includes(q)).map(role => ({ token: `<@role:${role.id}|${sanitizeReferenceName(role.name)}>`, label: role.name, kind: 'role' as const })),
      ...data.attributes.filter(attribute => attribute.name.toLowerCase().includes(q)).map(attribute => ({ token: `<@attr:${attribute.id}|${sanitizeReferenceName(attribute.name)}>`, label: attribute.name, kind: 'attribute' as const })),
    ].slice(0, 8)
  }, [trigger, data.channels, data.members, data.roles, data.attributes])

  const update = (text: string, caret: number) => {
    onChange(text)
    setTrigger(referenceTrigger(text, caret))
  }
  const insert = (candidate: Candidate) => {
    if (!trigger) return
    // キーボードで候補へ移ると入力欄のカーソル位置が読めないため、入力中の `@名前` の終わりを使う
    const caret = trigger.start + 1 + trigger.query.length
    const next = `${value.slice(0, trigger.start)}${candidate.token} ${value.slice(caret)}`
    onChange(next)
    setTrigger(null)
    const position = trigger.start + candidate.token.length + 1
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(position, position)
    })
  }
  // 候補の一覧へフォーカスが移っても閉じない（Tab で候補を選べるようにする）。どちらからも外れたら閉じる
  const closeUnlessInPicker = (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null
    if (next && (pickerRef.current?.contains(next) || next === ref.current)) return
    setTrigger(null)
  }
  const kindLabel = (kind: Candidate['kind']) =>
    kind === 'member' ? t('Member') : kind === 'role' ? t('Project role') : kind === 'attribute' ? t('Attribute') : t('Channel')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <textarea
        ref={ref}
        id={id}
        name="automationInstruction"
        className="form-control"
        rows={6}
        maxLength={10000}
        placeholder={placeholder}
        value={value}
        onChange={event => update(event.target.value, event.target.selectionStart)}
        onKeyUp={event => setTrigger(referenceTrigger(event.currentTarget.value, event.currentTarget.selectionStart))}
        onBlur={closeUnlessInPicker}
        style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
      />
      {trigger && (
        <div ref={pickerRef} role="listbox" aria-label={t('References')} onBlur={closeUnlessInPicker} style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          {data.error ? (
            <div role="alert" style={{ padding: '8px 12px', fontSize: 12, color: 'var(--red-text)' }}>{data.error.message}</div>
          ) : data.isLoading ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-4)' }}>{t('Loading...')}</div>
          ) : candidates.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-4)' }}>{t('No matches')}</div>
          ) : candidates.map(candidate => (
            <button
              key={candidate.token}
              type="button"
              role="option"
              aria-selected={false}
              className="hover-bg"
              // マウスでは入力欄のフォーカスを保ったまま選び、キーボード・支援技術ではボタンとして押せるようにする
              onMouseDown={event => event.preventDefault()}
              onClick={() => insert(candidate)}
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
