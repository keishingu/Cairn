// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { MobileHeader } from '../mobile-header'
import { Icon, Avatar } from '../../primitives'

const CHANNELS = [
  { id: 'c1', name: '北アルプス縦走計画', unread: 5,  last: '田中: 計画書アップしました', time: '5分前',   project: true },
  { id: 'c2', name: '夏山合宿計画',       unread: 7,  last: '佐藤: ルート確認お願いします', time: '10分前', project: true },
  { id: 'c3', name: 'クライミング講習会', unread: 2,  last: '鈴木: 装備リスト共有です',   time: '1時間前', project: true },
  { id: 'c4', name: '雑談',               unread: 3,  last: '中村: お疲れさまです〜',      time: '昨日',    project: false },
  { id: 'c5', name: '連絡事項',           unread: 1,  last: '伊藤: 次回集合時間について',  time: '昨日',    project: false },
  { id: 'c6', name: '雪山訓練',           unread: 0,  last: '高橋: 了解しました',         time: '2日前',   project: true },
]

const THREAD: { n: string; t: string; x: string; me?: boolean }[] = [
  { n: '山田 太郎', t: '18:30', x: '計画書 v2 をアップしました。日程とルートを確認してください！' },
  { n: '佐藤 花子', t: '19:15', x: '確認しました。1日目のテント場を少し下げた方が安全かもです' },
  { n: '鈴木 健',   t: '19:45', x: 'ガス缶を予備含めて+1個追加を推奨します' },
  { n: '山田 太郎', t: '20:10', x: 'ありがとうございます！明日のミーティングで確定します', me: true },
]

export function MobileChat() {
  const [selected, setSelected] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState('')
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const channel = CHANNELS.find(c => c.id === selected)

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [selected])

  // Thread view
  if (selected && channel) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
        <MobileHeader
          title={channel.name}
          onBack={() => setSelected(null)}
          right={<button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}><Icon name="more" size={18}/></button>}
        />
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '12px 16px', paddingBottom: 8 }}>
          {THREAD.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <Avatar name={m.n} size={34}/>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{m.n}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{m.t}</span>
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
                  {m.x}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 12px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 12px' }}>
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={`#${channel.name} にメッセージ`}
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', minHeight: 22 }}
            />
            <button style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: draft.trim() ? 'var(--accent)' : 'var(--border-2)', color: draft.trim() ? 'var(--on-accent)' : 'var(--text-4)', cursor: draft.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="send" size={14}/>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Channel list
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
      <MobileHeader title="チャット" right={
        <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
          <Icon name="plus" size={20}/>
        </button>
      }/>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        {CHANNELS.map((ch, i) => (
          <button key={ch.id} onClick={() => setSelected(ch.id)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', border: 'none', background: 'transparent',
            borderBottom: i < CHANNELS.length - 1 ? '1px solid var(--divider)' : 'none',
            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: ch.project ? 'var(--accent-soft)' : 'var(--card-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={ch.project ? 'mountain' : 'chat'} size={20} color={ch.project ? 'var(--accent-text)' : 'var(--text-3)'}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 14.5, fontWeight: ch.unread > 0 ? 700 : 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{ch.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-4)', flexShrink: 0 }}>{ch.time}</span>
              </div>
              <div style={{ fontSize: 13, color: ch.unread > 0 ? 'var(--text-2)' : 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: ch.unread > 0 ? 500 : 400 }}>{ch.last}</div>
            </div>
            {ch.unread > 0 && (
              <div style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ch.unread}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
