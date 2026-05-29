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

const FILTERS = [
  { id: 'all',     label: 'すべて' },
  { id: 'mention', label: '@メンション' },
  { id: 'ai',      label: 'AI' },
  { id: 'unread',  label: '未読' },
]

interface PageNotificationsProps {
  onClose: () => void
  isMobile?: boolean
}

export const PageNotifications = ({ onClose, isMobile = false }: PageNotificationsProps) => {
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

  const header = (
    <div style={{ borderBottom: '1px solid var(--divider)', ...(isMobile && { paddingTop: 'env(safe-area-inset-top)' }) }}>
      {/* タイトル行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 0' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          通知
          {unreadCount > 0 && (
            <span style={{ background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999 }}>{unreadCount}</span>
          )}
        </h2>
        {!isMobile && push.permission !== 'unsupported' && push.permission !== 'denied' && (
          <button
            className="btn btn-ghost"
            style={{ height: 28, fontSize: 12, padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={push.permission === 'granted' ? push.unsubscribe : push.subscribe}
            disabled={push.loading}
            title={push.permission === 'granted' ? 'プッシュ通知を無効化' : 'プッシュ通知を有効化'}
          >
            <Icon name={push.permission === 'granted' ? 'bell-off' : 'bell'} size={12} />
            {push.permission === 'granted' ? 'OFF' : 'ON'}
          </button>
        )}
        <button
          className="btn btn-ghost"
          style={{ height: 28, fontSize: 12, padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: 4, opacity: unreadCount === 0 ? 0.4 : 1 }}
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0 || markRead.isPending}
        >
          <Icon name="check" size={12} /> すべて既読
        </button>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={15}/>
        </button>
      </div>

      {/* モバイル: プッシュ通知トグル行 */}
      {isMobile && push.permission !== 'unsupported' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px 0' }}>
          <Icon name={push.permission === 'granted' ? 'bell' : 'bell-off'} size={13} color="var(--text-3)" />
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-3)' }}>
            {push.permission === 'denied'
              ? 'ブラウザの設定で通知が拒否されています'
              : push.permission === 'granted' ? 'プッシュ通知 オン' : 'プッシュ通知 オフ'}
          </span>
          {push.permission !== 'denied' && (
            <button
              onClick={push.permission === 'granted' ? push.unsubscribe : push.subscribe}
              disabled={push.loading}
              style={{
                position: 'relative', width: 44, height: 26, borderRadius: 999,
                border: 'none', cursor: push.loading ? 'default' : 'pointer', padding: 0, flexShrink: 0,
                background: push.permission === 'granted' ? 'var(--accent)' : 'var(--card-hover)',
                transition: 'background .2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%',
                background: 'var(--card)', boxShadow: '0 1px 3px rgba(0,0,0,.25)',
                transition: 'left .2s',
                left: push.permission === 'granted' ? 21 : 3,
              }}/>
            </button>
          )}
        </div>
      )}

      {/* フィルタータブ */}
      <div style={{ display: 'flex', gap: 4, padding: '10px 18px 12px' }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: '5px 12px', borderRadius: 999, border: 'none', background: filter === f.id ? 'var(--card-hover)' : 'transparent', color: filter === f.id ? 'var(--text)' : 'var(--text-3)', fontSize: 12, fontWeight: filter === f.id ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>{f.label}</button>
        ))}
      </div>
    </div>
  )

  const list = (
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
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>{n.body}</div>
            </div>
          </div>
        )
      })}
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--card)', zIndex: 60, display: 'flex', flexDirection: 'column', animation: 'slideUpSheet .25s cubic-bezier(.2,.7,.3,1)' }}>
        {header}
        {list}
      </div>
    )
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--overlay)', zIndex: 30, animation: 'notifFadeIn .15s ease-out' }}/>
      <aside style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 400, background: 'var(--card)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', zIndex: 31, display: 'flex', flexDirection: 'column', animation: 'notifSlideIn .2s cubic-bezier(.2,.7,.3,1)' }}>
        {header}
        {list}
      </aside>
    </>
  )
}
