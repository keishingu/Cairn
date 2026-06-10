'use client'

import React from 'react'
import { Icon } from '../primitives'
import {
  useNotifications,
  useMarkNotificationsRead,
  formatRelativeTime,
  type NotificationDto,
} from '@/lib/notifications/client'
import { usePushNotifications } from '@/lib/push/client'

const TYPE_CONFIG: Record<NotificationDto['type'], { icon: string; c: string; bg: string }> = {
  mention:  { icon: 'chat',     c: 'var(--blue)',    bg: 'var(--blue-soft)' },
  file:     { icon: 'file',     c: 'var(--violet)',  bg: 'var(--violet-soft)' },
  status:   { icon: 'flag',     c: 'var(--amber)',   bg: 'var(--amber-soft)' },
  ai:       { icon: 'sparkles', c: 'var(--accent)',  bg: 'var(--accent-soft)' },
  task:     { icon: 'check',    c: 'var(--emerald)', bg: 'var(--emerald-soft)' },
  invite:   { icon: 'users',    c: 'var(--rose)',    bg: 'var(--rose-soft)' },
  reaction: { icon: 'heart',    c: 'var(--rose)',    bg: 'var(--rose-soft)' },
}

function parseMentionText(text: string): string {
  return text.replace(/<@[^|>]+\|([^>]+)>/g, '@$1')
}

const FILTERS = [
  { id: 'all',     label: 'すべて' },
  { id: 'mention', label: '@メンション' },
  { id: 'ai',      label: 'AI' },
  { id: 'unread',  label: '未読' },
]

interface PageNotificationsProps {
  onClose: () => void
}

export const PageNotifications = ({ onClose }: PageNotificationsProps) => {
  const [filter, setFilter] = React.useState('all')
  const { data: notifications = [], isLoading } = useNotifications(filter)
  const markRead = useMarkNotificationsRead()
  const push = usePushNotifications()

  const unreadCount = React.useMemo(
    () => notifications.filter(n => n.readAt === null).length,
    [notifications],
  )

  const handleMarkAllRead = () => markRead.mutate(undefined)

  const handleMarkOneRead = (id: string, isUnread: boolean) => {
    if (!isUnread) return
    markRead.mutate([id])
  }

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
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0 || markRead.isPending}
            >
              <Icon name="check" size={12} /> すべて既読
            </button>
            {push.permission !== 'unsupported' && push.permission !== 'denied' && (
              <button
                className="btn btn-ghost"
                style={{ width: 28, height: 28, padding: 0, justifyContent: 'center', color: push.permission === 'granted' ? 'var(--accent)' : 'var(--text-3)' }}
                onClick={push.permission === 'granted' ? push.unsubscribe : push.subscribe}
                disabled={push.loading}
                title={push.permission === 'granted' ? 'プッシュ通知を無効化' : 'プッシュ通知を有効化'}
              >
                <Icon name="bell" size={14}/>
              </button>
            )}
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={15}/>
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: '5px 12px', borderRadius: 999, border: 'none', background: filter === f.id ? 'var(--card-hover)' : 'transparent', color: filter === f.id ? 'var(--text)' : 'var(--text-3)', fontSize: 12, fontWeight: filter === f.id ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>{f.label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>読み込み中...</div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>該当する通知はありません</div>
          ) : notifications.map((n) => {
            const cfg = TYPE_CONFIG[n.type]
            const isUnread = n.readAt === null
            const senderName = n.data?.['senderName'] ?? null
            return (
              <div key={n.id}
                style={{ display: 'flex', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--divider)', background: isUnread ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer', position: 'relative' }}
                onClick={() => handleMarkOneRead(n.id, isUnread)}
                onMouseEnter={e => { if (!isUnread) (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
                onMouseLeave={e => { if (!isUnread) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {isUnread && <span style={{ position: 'absolute', top: 18, left: 7, width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }}/>}
                <div style={{ width: 32, height: 32, borderRadius: 8, background: cfg.bg, color: cfg.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={cfg.icon} size={15}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {senderName ?? (n.type === 'ai' ? 'AIアシスタント' : n.title)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-4)', flexShrink: 0 }}>· {formatRelativeTime(n.createdAt)}</span>
                  </div>
                  {senderName && (
                    <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
                      {n.title.replace(senderName + ' ', '')}
                    </div>
                  )}
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>{parseMentionText(n.body)}</div>
                </div>
              </div>
            )
          })}
        </div>
      </aside>
    </>
  )
}
