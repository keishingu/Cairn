'use client'

import React from 'react'
import { Icon } from '../primitives'

interface NotifItem {
  k: string
  icon: string
  who: string
  t: string
  p: string
  when: string
  unread?: boolean
  ai?: boolean
}

const ITEMS: NotifItem[] = [
  { k: 'mention',  icon: 'chat',     who: '佐藤 花子',     t: '@山田 太郎 1日目のテント場について意見ある？',         p: '北アルプス縦走計画', when: '5分前',   unread: true },
  { k: 'file',     icon: 'file',     who: '田中 陽子',     t: '北アルプス縦走計画書_v2.pdf をアップロードしました',    p: '北アルプス縦走計画', when: '20分前',  unread: true },
  { k: 'status',   icon: 'flag',     who: '鈴木 健',       t: 'クライミング講習会 を 審議中 に変更',                    p: 'クライミング講習会', when: '1時間前', unread: true },
  { k: 'ai',       icon: 'sparkles', who: 'AIアシスタント', t: '装備リストの不足（予備ガス缶+2個）を検出しました',     p: '北アルプス縦走計画', when: '2時間前', unread: true, ai: true },
  { k: 'task',     icon: 'check',    who: '伊藤 翔',       t: 'タスク「ルート案を作成する」を完了しました',            p: '北アルプス縦走計画', when: '3時間前' },
  { k: 'invite',   icon: 'users',    who: '高橋 美咲',     t: '雪山訓練 に招待されました',                             p: '雪山訓練',           when: '昨日' },
  { k: 'reaction', icon: 'heart',    who: '中村 拓也',     t: 'あなたのメッセージに 👍 リアクション',                  p: '夏山合宿計画',       when: '昨日' },
  { k: 'file',     icon: 'file',     who: '小林 大地',     t: 'ルートマップ.gpx を更新しました',                       p: '雪山訓練',           when: '昨日' },
]

const KIND_MAP: Record<string, { c: string; bg: string }> = {
  mention:  { c: 'var(--blue)',    bg: 'var(--blue-soft)' },
  file:     { c: 'var(--violet)',  bg: 'var(--violet-soft)' },
  status:   { c: 'var(--amber)',   bg: 'var(--amber-soft)' },
  ai:       { c: 'var(--accent)',  bg: 'var(--accent-soft)' },
  task:     { c: 'var(--emerald)', bg: 'var(--emerald-soft)' },
  invite:   { c: 'var(--rose)',    bg: 'var(--rose-soft)' },
  reaction: { c: 'var(--rose)',    bg: 'var(--rose-soft)' },
}

interface PageNotificationsProps {
  onClose: () => void
}

export const PageNotifications = ({ onClose }: PageNotificationsProps) => {
  const [filter, setFilter] = React.useState('all')
  const [readIds, setReadIds] = React.useState<Set<string>>(new Set())
  const filters = [
    { id: 'all',     l: 'すべて' },
    { id: 'mention', l: '@メンション' },
    { id: 'ai',      l: 'AI' },
    { id: 'unread',  l: '未読' },
  ]

  const items = ITEMS.map(it => ({ ...it, unread: it.unread && !readIds.has(it.k + it.t) }))

  const filtered = items.filter(it =>
    filter === 'all' ? true :
    filter === 'unread' ? it.unread :
    filter === 'mention' ? it.k === 'mention' :
    filter === 'ai' ? it.k === 'ai' : true
  )
  const unreadCount = items.filter(i => i.unread).length
  const markAllRead = () => setReadIds(new Set(ITEMS.filter(i => i.unread).map(i => i.k + i.t)))

  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--overlay)', zIndex: 30, animation: 'notifFadeIn .15s ease-out' }}/>
      <aside style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 400, background: 'var(--card)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', zIndex: 31, display: 'flex', flexDirection: 'column', animation: 'notifSlideIn .2s cubic-bezier(.2,.7,.3,1)' }}>
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              通知
              {unreadCount > 0 && (
                <span style={{ background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999 }}>{unreadCount}</span>
              )}
            </h2>
            <button
              className="btn btn-ghost"
              style={{ height: 28, fontSize: 12, padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: 4, opacity: unreadCount === 0 ? 0.4 : 1 }}
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              <Icon name="check" size={12} /> すべて既読
            </button>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={15}/>
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
            {filters.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: '5px 12px', borderRadius: 999, border: 'none', background: filter === f.id ? 'var(--card-hover)' : 'transparent', color: filter === f.id ? 'var(--text)' : 'var(--text-3)', fontSize: 12, fontWeight: filter === f.id ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>{f.l}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>該当する通知はありません</div>
          ) : filtered.map((it, i) => {
            const cfg = KIND_MAP[it.k] ?? KIND_MAP['file']!
            return (
              <div key={i}
                style={{ display: 'flex', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--divider)', background: it.unread ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer', position: 'relative' }}
                onClick={() => it.unread && setReadIds(prev => new Set([...prev, it.k + it.t]))}
                onMouseEnter={e => { if (!it.unread) (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
                onMouseLeave={e => { if (!it.unread) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {it.unread && <span style={{ position: 'absolute', top: 18, left: 7, width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }}/>}
                <div style={{ width: 32, height: 32, borderRadius: 8, background: cfg.bg, color: cfg.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={it.icon} size={15}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{it.who}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-4)' }}>· {it.when}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 4 }}>{it.t}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="folder" size={10.5}/> {it.p}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </aside>
    </>
  )
}
