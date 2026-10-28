'use client'

// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// AIアシスタントの入力欄で `@` を打ったときのメンバーの候補。入力欄には `@表示名` を見せ、送信時に
// `<@userId|表示名>` へ置き換える。AI は名前で探し直さずにこの ID で調べられ、同名の人を取り違えない。

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '@/components/locale-provider'
import { sanitizeReferenceName } from '@/lib/ai/reference-name'
import { encodeInsertedMentions, survivingMentionTokenIds, type MentionInsertion } from '@/lib/chat/mention-insertions'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

interface MemberCandidate {
  userId: string
  name: string
}

// 日本語入力で打った全角の ＠ でも候補を出す
const TRIGGER_RE = /(^|\s)[@＠]([^\s@＠<>]*)$/

/** カーソル直前の `@名前` を見つける（入力中の候補を出すため） */
export function memberMentionTrigger(text: string, caret: number): { query: string; start: number } | null {
  const match = TRIGGER_RE.exec(text.slice(0, caret))
  if (!match) return null
  const query = match[2] ?? ''
  return { query, start: caret - query.length - 1 }
}

/** 送信する本文。ピッカーで入れた `@表示名` を `<@userId|表示名>` にする */
export function encodeAiMemberMentions(text: string, insertions: ReadonlyArray<MentionInsertion>): string {
  return encodeInsertedMentions(text, insertions, ({ tokenId, displayName }) => `<@${tokenId}|${displayName}>`)
}

async function fetchMembers(query: string): Promise<MemberCandidate[]> {
  const response = await fetchWithAuth(`/api/research/members?limit=8&query=${encodeURIComponent(query)}`)
  if (!response.ok) throw new Error(`Could not load suggestions (${response.status})`)
  const body = (await response.json()) as { items?: MemberCandidate[] }
  return body.items ?? []
}

export function useAiMemberMentions({ input, setInput, textareaRef }: {
  input: string
  setInput: (value: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const [trigger, setTrigger] = React.useState<ReturnType<typeof memberMentionTrigger>>(null)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [insertions, setInsertions] = React.useState<MentionInsertion[]>([])
  const query = React.useDeferredValue(trigger?.query.trim() ?? '')
  const members = useQuery({
    queryKey: ['ai-member-mention-candidates', query],
    queryFn: () => fetchMembers(query),
    enabled: trigger !== null,
  })
  // すでに入れた人は候補に出さない（同じ人を二重に入れない）
  const mentioned = React.useMemo(() => survivingMentionTokenIds(input, insertions), [input, insertions])
  const candidates = React.useMemo(
    () => (members.data ?? []).filter(member => !mentioned.has(member.userId)),
    [members.data, mentioned],
  )

  const syncTrigger = (text: string, caret: number) => {
    setTrigger(memberMentionTrigger(text, caret))
    setActiveIndex(0)
  }

  const select = (member: MemberCandidate) => {
    if (!trigger) return
    const displayName = sanitizeReferenceName(member.name)
    const end = trigger.start + 1 + trigger.query.length
    const next = `${input.slice(0, trigger.start)}@${displayName} ${input.slice(end)}`
    setInput(next)
    setInsertions(prev => [...prev, { tokenId: member.userId, displayName }])
    setTrigger(null)
    const position = trigger.start + displayName.length + 2
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(position, position)
    })
  }

  /** 候補が開いているときのキー操作。処理したら true を返す（Enter で送信させない） */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!trigger) return false
    if (event.key === 'Escape') {
      event.preventDefault()
      setTrigger(null)
      return true
    }
    if (candidates.length === 0) return false
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex(index => (index + step + candidates.length) % candidates.length)
      return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      select(candidates[Math.min(activeIndex, candidates.length - 1)]!)
      return true
    }
    return false
  }

  return {
    syncTrigger,
    handleKeyDown,
    close: () => setTrigger(null),
    /** 送信する本文に変換し、挿入の記録を空にする */
    takeEncoded: (text: string) => {
      const encoded = encodeAiMemberMentions(text, insertions)
      setInsertions([])
      setTrigger(null)
      return encoded
    },
    picker: trigger ? (
      <MemberMentionPicker
        candidates={candidates}
        activeIndex={activeIndex}
        isLoading={members.isLoading}
        error={members.error}
        onSelect={select}
      />
    ) : null,
  }
}

function MemberMentionPicker({ candidates, activeIndex, isLoading, error, onSelect }: {
  candidates: MemberCandidate[]
  activeIndex: number
  isLoading: boolean
  error: Error | null
  onSelect: (member: MemberCandidate) => void
}) {
  const t = useT()
  const message = (text: string, color = 'var(--text-4)') => (
    <div role={color === 'var(--red-text)' ? 'alert' : undefined} style={{ padding: '8px 12px', fontSize: 12, color }}>{text}</div>
  )
  return (
    <div role="listbox" aria-label={t('Members')} style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      {error
        ? message(t('Could not load suggestions. Try again later.'), 'var(--red-text)')
        : isLoading
          ? message(t('Loading...'))
          : candidates.length === 0
            ? message(t('No matching members'))
            : candidates.map((member, index) => (
              <button
                key={member.userId}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                // 入力欄のフォーカスを外さずに選ぶ（外すとカーソル位置が分からなくなる）
                onMouseDown={event => event.preventDefault()}
                onClick={() => onSelect(member)}
                className="hover-bg"
                style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', background: index === activeIndex ? 'var(--card-hover)' : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 13, color: 'var(--text)' }}
              >
                @{member.name}
              </button>
            ))}
    </div>
  )
}
