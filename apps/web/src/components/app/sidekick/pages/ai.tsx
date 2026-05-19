// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { MobileHeader } from '../mobile-header'
import { Icon, TypingDots } from '../../primitives'

interface Msg { role: 'user' | 'ai'; text: string }

const INITIAL: Msg[] = [
  { role: 'ai', text: '北アルプス縦走計画の装備リストを確認しました。ガス缶が予備を含めて不足しています。4泊5日・8名の計画では予備2個追加を推奨します。他にご質問はありますか？' },
]

const SUGGESTIONS = ['ルートの危険箇所は？', '天気予報を確認', '装備リストを最適化']

export function MobileAI() {
  const [msgs, setMsgs] = React.useState<Msg[]>(INITIAL)
  const [draft, setDraft] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs, loading])

  const send = (text?: string) => {
    const t = (text ?? draft).trim()
    if (!t || loading) return
    setMsgs(prev => [...prev, { role: 'user', text: t }])
    setDraft('')
    setLoading(true)
    setTimeout(() => {
      setMsgs(prev => [...prev, { role: 'ai', text: `「${t}」についての回答です。現在の計画に基づくと、安全性と効率の観点から検討が必要です。詳細な分析を行いましょうか？` }])
      setLoading(false)
    }, 1400)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: 'var(--bg)' }}>
      <MobileHeader title="AIアシスタント" right={
        <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
          <Icon name="plus" size={20}/>
        </button>
      }/>

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'ai' && (
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="sparkles" size={15} color="#fff"/>
              </div>
            )}
            <div style={{
              maxWidth: '80%', padding: '12px 14px', borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: m.role === 'user' ? 'var(--accent)' : 'var(--card)',
              color: m.role === 'user' ? 'var(--on-accent)' : 'var(--text)',
              border: m.role === 'user' ? 'none' : '1px solid var(--border)',
              fontSize: 14, lineHeight: 1.6,
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="sparkles" size={15} color="#fff"/>
            </div>
            <div style={{ padding: '14px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px 18px 18px 4px' }}>
              <TypingDots/>
            </div>
          </div>
        )}
      </div>

      {/* Suggestion chips */}
      {msgs.length <= 1 && (
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 10px', overflowX: 'auto' }}>
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => send(s)} style={{ border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-2)', borderRadius: 999, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: '8px 12px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 16, padding: '10px 14px' }}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
            placeholder="AIに質問する…"
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
          />
          <button onClick={() => send()} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: draft.trim() ? 'var(--accent)' : 'var(--border-2)', color: draft.trim() ? 'var(--on-accent)' : 'var(--text-4)', cursor: draft.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s' }}>
            <Icon name="send" size={15}/>
          </button>
        </div>
      </div>
    </div>
  )
}
