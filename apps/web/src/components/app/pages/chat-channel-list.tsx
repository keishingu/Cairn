'use client'

import React from 'react'
import { Icon, Avatar, AvatarStack, UnreadBadge } from '../primitives'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { getUserStatusColor, getUserStatusLabel } from '@/lib/user-status'
import type { ProjectChannelDto } from '@/app/api/projects/channels/route'
import type { WorkspaceChannelDto } from '@/app/api/workspaces/channels/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { DmChannelDto } from '@/app/api/workspaces/dms/route'

// ─── ChatSidebarSection ───────────────────────────────────────────

// 見出し横の追加ボタン: 低頻度の補助アクションなので ghost。
// accent 色は未読バッジに独占させ、視線誘導が競合しないようにする。
// 通常時は薄いグレーのアイコンのみ、hover 時だけ濃く＋背景を付けて押下可能を示す。
const sectionAddButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
  background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
  color: 'var(--text-4)',
}

// hover で濃いグレー＋うっすら背景（ChatSidebarItem の hover と同じトーン）
const onAddButtonEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.background = 'var(--card)'
  e.currentTarget.style.color = 'var(--text-2)'
}
const onAddButtonLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.background = 'transparent'
  e.currentTarget.style.color = 'var(--text-4)'
}

export const ChatSidebarSection = ({ title, children, onAdd }: { title: string; children: React.ReactNode; onAdd?: () => void }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '6px 10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{title}</span>
      {onAdd && (
        <button onClick={onAdd} aria-label={`${title}を追加`} style={sectionAddButtonStyle} onMouseEnter={onAddButtonEnter} onMouseLeave={onAddButtonLeave}>
          <Icon name="plus" size={13} strokeWidth={2.4} color="currentColor"/>
        </button>
      )}
    </div>
    <div>{children}</div>
  </div>
)

// ─── ChatSidebarCollapsibleSection ────────────────────────────────

// アーカイブ済みプロジェクトなど、通常は隠しておきたいセクション。
// 既定で折りたたみ、開閉状態は localStorage に保存する。
const ChatSidebarCollapsibleSection = ({ title, count, defaultCollapsed = true, children }: { title: string; count: number; defaultCollapsed?: boolean; children: React.ReactNode }) => {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed)

  React.useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.chat_archived_collapsed)
    if (saved !== null) setCollapsed(saved === 'true')
  }, [])

  const toggle = () => setCollapsed(prev => {
    const next = !prev
    localStorage.setItem(STORAGE_KEYS.chat_archived_collapsed, String(next))
    return next
  })

  return (
    <div style={{ marginBottom: 10 }}>
      <button
        onClick={toggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em',
          padding: '6px 10px', textTransform: 'uppercase',
          background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <Icon name="chevRight" size={12} color="currentColor" style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform .12s' }}/>
        <span>{title}</span>
        <span style={{ color: 'var(--text-4)', fontWeight: 600 }}>{count}</span>
      </button>
      {!collapsed && <div>{children}</div>}
    </div>
  )
}

// ─── ChatSidebarItem ──────────────────────────────────────────────

// プロジェクトの期間を一覧用に短く整形（年は省略）。
// date 列の 'YYYY-MM-DD' を UTC 解釈せずローカル日付として扱う（負オフセットで前日になるのを防ぐ）
export function formatChannelPeriod(start: string | null, end: string | null): string | undefined {
  const f = (iso: string) => { const [, m, d] = iso.slice(0, 10).split('-').map(Number); return `${m}/${d}` }
  if (start && end) return `${f(start)}〜${f(end)}`
  if (end) return `〜${f(end)}`
  if (start) return `${f(start)}〜`
  return undefined
}

export const ChatSidebarItem = ({ active, onClick, prefix, avatar, avatarUrl, dot, label, dateMeta, dateMetaBehavior = 'fixed', badge, mobile, memberNames, memberCount }: {
  active?: boolean; onClick?: () => void; prefix?: string
  avatar?: string; avatarUrl?: string; dot?: string; label: string; dateMeta?: string; dateMetaBehavior?: 'fixed' | 'truncate'; badge?: number; mobile?: boolean
  memberNames?: string[]; memberCount?: number
}) => (
  <button onClick={onClick} style={{
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: mobile ? '11px 16px' : '6px 10px',
    borderRadius: mobile ? 0 : 6,
    borderBottom: mobile ? '1px solid var(--divider)' : 'none',
    border: mobile ? undefined : 'none',
    background: active && !mobile ? 'var(--card-hover)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text-2)',
    fontSize: mobile ? 15 : 13,
    fontWeight: badge && badge > 0 ? 600 : 500,
    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
  }}
    onMouseEnter={e => { if (!active && !mobile) (e.currentTarget as HTMLElement).style.background = 'var(--card)' }}
    onMouseLeave={e => { if (!active && !mobile) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
  >
    {prefix === 'lock' ? (
      <span style={{ width: mobile ? 36 : 14, height: mobile ? 36 : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: mobile ? 8 : undefined, background: mobile ? 'var(--card-2)' : undefined, color: 'var(--text-3)' }}>
        <Icon name="lock" size={mobile ? 18 : 12}/>
      </span>
    ) : prefix ? (
      mobile ? (
        <span style={{ width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-text)', fontSize: 18 }}>{prefix}</span>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--text-3)', width: 14, textAlign: 'center' }}>{prefix}</span>
      )
    ) : null}
    {avatar && (
      <div style={{ position: 'relative' }}>
        <Avatar name={avatar} url={avatarUrl ?? null} size={mobile ? 36 : 18}/>
        {dot && <span style={{ position: 'absolute', bottom: -1, right: -1, width: mobile ? 10 : 6, height: mobile ? 10 : 6, borderRadius: '50%', background: dot, border: `2px solid var(--${mobile ? 'bg' : 'card-2'})` }}/>}
      </div>
    )}
    <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {dateMeta && (
        <span
          title={dateMetaBehavior === 'truncate' ? dateMeta : undefined}
          style={dateMetaBehavior === 'truncate'
            ? { minWidth: 0, maxWidth: mobile ? '45%' : '42%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: mobile ? 11 : 10, color: 'var(--text-4)', fontWeight: 500, flexShrink: 1 }
            : { flexShrink: 0, fontSize: mobile ? 11 : 10, color: 'var(--text-4)', fontWeight: 500, whiteSpace: 'nowrap' }}
        >
          {dateMeta}
        </span>
      )}
    </span>
    {badge != null && <UnreadBadge count={badge} size={mobile ? 'md' : 'sm'} />}
    {memberNames && memberNames.length > 0 && mobile && (
      <AvatarStack names={memberNames} size={22} max={3}/>
    )}
    {memberCount != null && !mobile && memberCount > 0 && (
      <span style={{ fontSize: 10.5, color: 'var(--text-4)', fontWeight: 500, flexShrink: 0 }}>{memberCount}名</span>
    )}
    {mobile && <Icon name="chevRight" size={16} color="var(--text-4)"/>}
  </button>
)

// ─── DmPicker ─────────────────────────────────────────────────────

interface DmPickerProps {
  members: WorkspaceMemberDto[]
  onStartDm: (userId: string) => void
}

const DmPicker = ({ members, onStartDm }: DmPickerProps) => {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button onClick={() => setOpen(p => !p)} aria-label="ダイレクトメッセージを開始" style={sectionAddButtonStyle} onMouseEnter={onAddButtonEnter} onMouseLeave={onAddButtonLeave}>
        <Icon name="plus" size={13} strokeWidth={2.4} color="currentColor"/>
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 50, minWidth: 160, overflow: 'hidden' }}>
          {members.map(m => (
            <button
              key={m.userId}
              onClick={() => { setOpen(false); onStartDm(m.userId) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <Avatar name={m.displayName} url={m.avatarUrl ?? null} size={20}/>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{m.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ChannelList ──────────────────────────────────────────────────

export interface ChannelListProps {
  channelId: string | null
  onSelectChannel: (id: string) => void
  projectChannels: ProjectChannelDto[]
  workspaceChannels: WorkspaceChannelDto[]
  dms: DmChannelDto[]
  members: WorkspaceMemberDto[]
  isMobile?: boolean
  onAddChannel: () => void
  onStartDm: (userId: string) => void
}

export const ChannelList = ({
  channelId, onSelectChannel, projectChannels, workspaceChannels,
  dms, members, isMobile = false, onAddChannel, onStartDm,
}: ChannelListProps) => {
  const activeProjectChannels = projectChannels.filter(c => !c.archived)
  const archivedProjectChannels = projectChannels.filter(c => c.archived)

  return (
  <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '8px 0' : '8px 6px', paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom))' : undefined }}>
    <ChatSidebarSection title="プロジェクト">
      {activeProjectChannels.map(c => {
        const period = formatChannelPeriod(c.startDate, c.endDate)
        return (
          <ChatSidebarItem key={c.channelId} active={channelId === c.channelId} onClick={() => onSelectChannel(c.channelId)} prefix="#" label={c.projectTitle} {...(period ? { dateMeta: period } : {})} badge={c.unreadCount} mobile={isMobile}/>
        )
      })}
    </ChatSidebarSection>
    {archivedProjectChannels.length > 0 && (
      <ChatSidebarCollapsibleSection title="アーカイブ済み" count={archivedProjectChannels.length}>
        {archivedProjectChannels.map(c => (
          <ChatSidebarItem key={c.channelId} active={channelId === c.channelId} onClick={() => onSelectChannel(c.channelId)} prefix="#" label={c.projectTitle} badge={c.unreadCount} mobile={isMobile}/>
        ))}
      </ChatSidebarCollapsibleSection>
    )}
    <ChatSidebarSection title="チャンネル" onAdd={onAddChannel}>
      {workspaceChannels.map(c => (
        <ChatSidebarItem key={c.id} active={channelId === c.id} onClick={() => onSelectChannel(c.id)} prefix={c.isPrivate ? 'lock' : '#'} label={c.name ?? ''} badge={c.unreadCount} mobile={isMobile} memberNames={c.memberNames} memberCount={c.memberCount}/>
      ))}
    </ChatSidebarSection>
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '6px 10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>ダイレクトメッセージ</span>
        <DmPicker members={members} onStartDm={onStartDm}/>
      </div>
      <div>
        {dms.map(d => (
          <ChatSidebarItem
            key={d.id}
            active={channelId === d.id}
            onClick={() => onSelectChannel(d.id)}
            avatar={d.participantName}
            {...(d.participantAvatarUrl ? { avatarUrl: d.participantAvatarUrl } : {})}
            dot={getUserStatusColor(d.participantStatus)}
            label={d.participantName}
            dateMeta={d.participantStatusMessage ?? getUserStatusLabel(d.participantStatus)}
            dateMetaBehavior="truncate"
            badge={d.unreadCount}
            mobile={isMobile}
          />
        ))}
      </div>
    </div>
    <ChatSidebarSection title="アプリ">
      <ChatSidebarItem prefix="✨" label="AIアシスタント" mobile={isMobile}/>
    </ChatSidebarSection>
  </div>
  )
}
