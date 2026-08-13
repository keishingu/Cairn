'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { FEATURE_FLAGS } from '@cairn/shared'
import { Icon, Avatar, AvatarStack, UnreadBadge } from '../primitives'
import { STORAGE_KEYS, chatCompletedMilestonesCollapsedKey } from '@/lib/storage-keys'
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
const ChatSidebarCollapsibleSection = ({ title, count, storageKey = STORAGE_KEYS.chat_archived_collapsed, defaultCollapsed = true, children }: {
  title: string
  count: number
  storageKey?: string
  defaultCollapsed?: boolean
  children: React.ReactNode
}) => {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed)

  React.useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved !== null) setCollapsed(saved === 'true')
  }, [storageKey])

  const toggle = () => setCollapsed(prev => {
    const next = !prev
    localStorage.setItem(storageKey, String(next))
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
const formatTime = (time: string | null) => time ? time.slice(0, 5) : null

export function formatChannelPeriod(start: string | null, end: string | null, startTime?: string | null, endTime?: string | null): string | undefined {
  const f = (iso: string) => { const [, m, d] = iso.slice(0, 10).split('-').map(Number); return `${m}/${d}` }
  const st = formatTime(startTime ?? null)
  const et = formatTime(endTime ?? null)
  if (start && end) {
    const startLabel = `${f(start)}${st ? ` ${st}` : ''}`
    const endLabel = `${end === start ? '' : f(end)}${et ? `${end === start ? '' : ' '}${et}` : ''}`
    return endLabel ? `${startLabel}〜${endLabel}` : startLabel
  }
  if (end) return `〜${f(end)}${et ? ` ${et}` : ''}`
  if (start) return `${f(start)}${st ? ` ${st}` : ''}〜`
  return undefined
}

export const ChatSidebarItem = ({ active, onClick, prefix, avatar, avatarUrl, dot, label, dateMeta, badge, mobile, memberNames, memberCount, action }: {
  active?: boolean; onClick?: () => void; prefix?: string
  avatar?: string; avatarUrl?: string; dot?: string; label: string; dateMeta?: string; badge?: number; mobile?: boolean
  memberNames?: string[]; memberCount?: number
  action?: React.ReactNode
}) => (
  <div className="chat-sidebar-item" style={{ position: 'relative' }}>
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
      padding: mobile ? `11px ${action ? 72 : 16}px 11px 16px` : `6px ${action ? 38 : 10}px 6px 10px`,
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
          {dot && (
            <span style={{ position: 'absolute', bottom: -1, right: -1, width: mobile ? 10 : 6, height: mobile ? 10 : 6, borderRadius: '50%', background: dot, border: `2px solid var(--${mobile ? 'bg' : 'card-2'})` }}/>
          )}
        </div>
      )}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {dateMeta && (
          <span style={{ flexShrink: 0, fontSize: mobile ? 11 : 10, color: 'var(--text-4)', fontWeight: 500, whiteSpace: 'nowrap' }}>{dateMeta}</span>
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
    {action && (
      <div
        className="chat-sidebar-item-action"
        data-always-visible={mobile || undefined}
        style={{ position: 'absolute', top: '50%', right: mobile ? 40 : 5, transform: 'translateY(-50%)', display: 'flex', zIndex: 1 }}
      >
        {action}
      </div>
    )}
  </div>
)

interface SidebarMenuAction {
  label: string
  icon: string
  onSelect: () => void
  restoreFocus?: boolean
}

const SidebarCreateMenu = ({ ownerLabel, actions, isMobile }: {
  ownerLabel: string
  actions: SidebarMenuAction[]
  isMobile: boolean
}) => {
  const [open, setOpen] = React.useState(false)
  const [position, setPosition] = React.useState({ top: 0, left: 0 })
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  const close = React.useCallback(() => setOpen(false), [])

  React.useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
        buttonRef.current?.focus()
      }
    }
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [close, open])

  const toggle = () => {
    if (open) {
      close()
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      const menuWidth = 240
      const menuHeight = actions.length * 34 + 8
      setPosition({
        left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
        top: rect.bottom + menuHeight + 8 > window.innerHeight ? rect.top - menuHeight - 4 : rect.bottom + 4,
      })
    }
    setOpen(true)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={`${ownerLabel}のメニュー`}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: isMobile ? 36 : 24,
          height: isMobile ? 36 : 24,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: 6,
          background: open ? 'var(--card-hover)' : 'transparent',
          color: open ? 'var(--text-2)' : 'var(--text-4)',
          cursor: 'pointer',
          padding: 0,
        }}
        onMouseEnter={event => { event.currentTarget.style.background = 'var(--card-hover)'; event.currentTarget.style.color = 'var(--text-2)' }}
        onMouseLeave={event => { if (!open) { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.color = 'var(--text-4)' } }}
      >
        <Icon name="more" size={isMobile ? 18 : 15} strokeWidth={2}/>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${ownerLabel}の操作`}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            width: 240,
            padding: 4,
            background: 'var(--card)',
            border: '1px solid var(--border-2)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-pop)',
            zIndex: 300,
          }}
        >
          {actions.map((action, index) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              autoFocus={index === 0}
              onClick={() => {
                close()
                action.onSelect()
                if (action.restoreFocus) buttonRef.current?.focus()
              }}
              style={{
                width: '100%', height: 34, display: 'flex', alignItems: 'center', gap: 8,
                border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--text-2)',
                cursor: 'pointer', padding: '0 9px', fontFamily: 'inherit', fontSize: 12.5, textAlign: 'left',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={event => { event.currentTarget.style.background = 'var(--card-2)' }}
              onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
            >
              <Icon name={action.icon} size={14}/>
              {action.label}
            </button>
          ))}
        </div>,
        buttonRef.current?.closest('.app') ?? buttonRef.current?.closest('.app-root') ?? document.body,
      )}
    </>
  )
}

const ProjectMilestoneItem = ({ channel, active, onSelectChannel, onEditMilestone, onSetMilestoneCompleted, isMobile }: {
  channel: ProjectChannelDto
  active: boolean
  onSelectChannel: (id: string) => void
  onEditMilestone?: (milestone: ProjectChannelDto) => void
  onSetMilestoneCompleted?: (milestone: ProjectChannelDto, completed: boolean) => void
  isMobile: boolean
}) => {
  const period = formatChannelPeriod(channel.startDate, channel.endDate, channel.startTime, channel.endTime)
  const completed = channel.milestoneCompleted === true
  const actions: SidebarMenuAction[] = []
  if (!completed && onEditMilestone) {
    actions.push({
      label: '編集',
      icon: 'edit',
      onSelect: () => onEditMilestone(channel),
    })
  }
  if (onSetMilestoneCompleted) {
    actions.push({
      label: completed ? '未完了にする' : '完了にする',
      icon: completed ? 'refresh' : 'check',
      onSelect: () => onSetMilestoneCompleted(channel, !completed),
      restoreFocus: true,
    })
  }
  return (
    <div style={{ paddingLeft: isMobile ? 0 : 18 }}>
      <ChatSidebarItem
        active={active}
        onClick={() => onSelectChannel(channel.channelId)}
        prefix="┗"
        label={channel.channelName}
        {...(period ? { dateMeta: period } : {})}
        badge={channel.unreadCount}
        mobile={isMobile}
        action={actions.length > 0 ? (
          <SidebarCreateMenu ownerLabel={channel.channelName} actions={actions} isMobile={isMobile} />
        ) : undefined}
      />
    </div>
  )
}

const WorkspaceThreadItem = ({ channel, active, onSelectChannel, isMobile }: {
  channel: WorkspaceChannelDto
  active: boolean
  onSelectChannel: (id: string) => void
  isMobile: boolean
}) => (
  <div style={{ paddingLeft: isMobile ? 0 : 18 }}>
    <ChatSidebarItem
      active={active}
      onClick={() => onSelectChannel(channel.id)}
      prefix="┗"
      label={channel.name ?? '名称未設定スレッド'}
      badge={channel.unreadCount}
      mobile={isMobile}
      memberNames={channel.memberNames}
      memberCount={channel.memberCount}
    />
  </div>
)

const ProjectChannelGroup = ({ general, activeMilestones, completedMilestones, channelId, onSelectChannel, onCreateMilestone, onEditMilestone, onSetMilestoneCompleted, isMobile }: {
  general: ProjectChannelDto
  activeMilestones: ProjectChannelDto[]
  completedMilestones: ProjectChannelDto[]
  channelId: string | null
  onSelectChannel: (id: string) => void
  onCreateMilestone?: (project: { id: string; title: string }) => void
  onEditMilestone?: (milestone: ProjectChannelDto) => void
  onSetMilestoneCompleted?: (milestone: ProjectChannelDto, completed: boolean) => void
  isMobile: boolean
}) => {
  const storageKey = chatCompletedMilestonesCollapsedKey(general.projectId)
  const containsActiveChannel = completedMilestones.some(channel => channel.channelId === channelId)
  const [collapsed, setCollapsed] = React.useState(true)

  React.useEffect(() => {
    if (containsActiveChannel) {
      setCollapsed(false)
      return
    }
    const saved = localStorage.getItem(storageKey)
    if (saved !== null) setCollapsed(saved === 'true')
  }, [containsActiveChannel, storageKey])

  const toggle = () => setCollapsed(previous => {
    const next = !previous
    localStorage.setItem(storageKey, String(next))
    return next
  })

  const actions: SidebarMenuAction[] = []
  if (onCreateMilestone) {
    actions.push({
      label: 'マイルストーンを作成',
      icon: 'flag',
      onSelect: () => onCreateMilestone({ id: general.projectId, title: general.projectTitle }),
    })
  }
  if (completedMilestones.length > 0) {
    actions.push({
      label: `完了済みマイルストーンを${collapsed ? '表示' : '非表示'}`,
      icon: collapsed ? 'eye' : 'eye-off',
      onSelect: toggle,
      restoreFocus: true,
    })
  }

  const period = formatChannelPeriod(general.startDate, general.endDate, general.startTime, general.endTime)

  return (
    <>
      <ChatSidebarItem
        active={channelId === general.channelId}
        onClick={() => onSelectChannel(general.channelId)}
        prefix="#"
        label={general.projectTitle}
        {...(period ? { dateMeta: period } : {})}
        badge={general.unreadCount}
        mobile={isMobile}
        action={actions.length > 0 ? (
          <SidebarCreateMenu ownerLabel={general.projectTitle} actions={actions} isMobile={isMobile} />
        ) : undefined}
      />
      {activeMilestones.map(channel => (
        <ProjectMilestoneItem
          key={channel.channelId}
          channel={channel}
          active={channelId === channel.channelId}
          onSelectChannel={onSelectChannel}
          {...(onEditMilestone ? { onEditMilestone } : {})}
          {...(onSetMilestoneCompleted ? { onSetMilestoneCompleted } : {})}
          isMobile={isMobile}
        />
      ))}
      {!collapsed && completedMilestones.map(channel => (
        <ProjectMilestoneItem
          key={channel.channelId}
          channel={channel}
          active={channelId === channel.channelId}
          onSelectChannel={onSelectChannel}
          {...(onSetMilestoneCompleted ? { onSetMilestoneCompleted } : {})}
          isMobile={isMobile}
        />
      ))}
    </>
  )
}

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
  onCreateMilestone?: (project: { id: string; title: string }) => void
  onEditMilestone?: (milestone: ProjectChannelDto) => void
  onSetMilestoneCompleted?: (milestone: ProjectChannelDto, completed: boolean) => void
  onCreateThread?: (channel: { id: string; name: string }) => void
}

export const ChannelList = ({
  channelId, onSelectChannel, projectChannels, workspaceChannels,
  dms, members, isMobile = false, onAddChannel, onStartDm, onCreateMilestone, onEditMilestone,
  onSetMilestoneCompleted, onCreateThread,
}: ChannelListProps) => {
  const activeProjectChannels = projectChannels.filter(c => !c.archived)
  const archivedProjectChannels = projectChannels.filter(c => c.archived && c.milestoneId === null)
  const projectGroups = activeProjectChannels
    .filter(c => c.milestoneId === null)
    .map(general => {
      const milestones = activeProjectChannels.filter(c => c.projectId === general.projectId && c.milestoneId !== null)
      return {
        general,
        activeMilestones: milestones.filter(c => c.milestoneCompleted !== true),
        completedMilestones: milestones.filter(c => c.milestoneCompleted === true),
      }
    })
  const workspaceChannelGroups = workspaceChannels
    .filter(channel => channel.parentChannelId === null)
    .map(channel => ({
      channel,
      threads: workspaceChannels.filter(candidate => candidate.parentChannelId === channel.id),
    }))
  return (
  <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '8px 0' : '8px 6px', paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom))' : undefined }}>
    <ChatSidebarSection title="プロジェクト">
      {projectGroups.map(({ general, activeMilestones, completedMilestones }) => (
        <ProjectChannelGroup
          key={general.channelId}
          general={general}
          activeMilestones={activeMilestones}
          completedMilestones={completedMilestones}
          channelId={channelId}
          onSelectChannel={onSelectChannel}
          {...(onCreateMilestone ? { onCreateMilestone } : {})}
          {...(onEditMilestone ? { onEditMilestone } : {})}
          {...(onSetMilestoneCompleted ? { onSetMilestoneCompleted } : {})}
          isMobile={isMobile}
        />
      ))}
    </ChatSidebarSection>
    {archivedProjectChannels.length > 0 && (
      <ChatSidebarCollapsibleSection title="アーカイブ済み" count={archivedProjectChannels.length}>
        {archivedProjectChannels.map(c => (
          <ChatSidebarItem key={c.channelId} active={channelId === c.channelId} onClick={() => onSelectChannel(c.channelId)} prefix="#" label={c.projectTitle} badge={c.unreadCount} mobile={isMobile}/>
        ))}
      </ChatSidebarCollapsibleSection>
    )}
    <ChatSidebarSection title="チャンネル" onAdd={onAddChannel}>
      {workspaceChannelGroups.map(({ channel, threads }) => (
        <React.Fragment key={channel.id}>
          <ChatSidebarItem
            active={channelId === channel.id}
            onClick={() => onSelectChannel(channel.id)}
            prefix={channel.isPrivate ? 'lock' : '#'}
            label={channel.name ?? ''}
            badge={channel.unreadCount}
            mobile={isMobile}
            memberNames={channel.memberNames}
            memberCount={channel.memberCount}
            action={onCreateThread && channel.name ? (
              <SidebarCreateMenu
                ownerLabel={channel.name}
                actions={[{
                  label: 'スレッドを作成',
                  icon: 'chat',
                  onSelect: () => onCreateThread({ id: channel.id, name: channel.name! }),
                }]}
                isMobile={isMobile}
              />
            ) : undefined}
          />
          {threads.map(thread => (
            <WorkspaceThreadItem
              key={thread.id}
              channel={thread}
              active={channelId === thread.id}
              onSelectChannel={onSelectChannel}
              isMobile={isMobile}
            />
          ))}
        </React.Fragment>
      ))}
    </ChatSidebarSection>
    {FEATURE_FLAGS.dm && (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '6px 10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>ダイレクトメッセージ</span>
          <DmPicker members={members} onStartDm={onStartDm}/>
        </div>
        <div>
          {dms.map(d => (
            <ChatSidebarItem key={d.id} active={channelId === d.id} onClick={() => onSelectChannel(d.id)} avatar={d.participantName} {...(d.participantAvatarUrl ? { avatarUrl: d.participantAvatarUrl } : {})} label={d.participantName} badge={d.unreadCount} mobile={isMobile}/>
          ))}
        </div>
      </div>
    )}
    <ChatSidebarSection title="アプリ">
      <ChatSidebarItem prefix="✨" label="AIアシスタント" mobile={isMobile}/>
    </ChatSidebarSection>
  </div>
  )
}
