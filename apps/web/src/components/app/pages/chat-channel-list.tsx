'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_CHAT_LIST_SORTS, FEATURE_FLAGS, chatUnreadDisplay, latestMessageAt, sortChatList, type ChatListSection, type ChatListSort, type ChatUnreadCounts } from '@cairn/shared'
import { useT } from '@/components/locale-provider'
import { Icon, Avatar, AvatarStack, UnreadBadge, portalHostFor } from '../primitives'
import { ChatListSortMenu } from './chat-list-sort-menu'
import { STORAGE_KEYS, chatArchivedThreadsCollapsedKey, chatCompletedMilestonesCollapsedKey } from '@/lib/storage-keys'
import type { ProjectChannelDto } from '@/app/api/projects/channels/route'
import type { WorkspaceChannelDto } from '@/app/api/workspaces/channels/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { DmChannelDto } from '@/app/api/workspaces/dms/route'

type TranslateFn = (message: string, values?: Record<string, string | number>) => string

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
const sectionAddButtonClass = 'hover-bg-card hover-text'

export const ChatSidebarSection = ({ title, children, onAdd, sortMenu }: { title: string; children: React.ReactNode; onAdd?: () => void; sortMenu?: React.ReactNode }) => {
  const t = useT()
  return (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{title}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        {sortMenu}
        {onAdd && (
          <button onClick={onAdd} aria-label={t('Add {title}', { title })} className={sectionAddButtonClass} style={sectionAddButtonStyle}>
            <Icon name="plus" size={13} strokeWidth={2.4} color="currentColor"/>
          </button>
        )}
      </span>
    </div>
    <div>{children}</div>
  </div>
  )
}

// ─── ChatSidebarCollapsibleSection ────────────────────────────────

// アーカイブ済みのプロジェクト・チャンネルなど、通常は隠しておきたいセクション。
// 既定で折りたたみ、開閉状態は localStorage に保存する。開いている会話を含むときは展開して見失わせない。
const ChatSidebarCollapsibleSection = ({ title, count, storageKey = STORAGE_KEYS.chat_archived_collapsed, defaultCollapsed = true, containsActiveChannel = false, children }: {
  title: string
  count: number
  storageKey?: string
  defaultCollapsed?: boolean
  containsActiveChannel?: boolean
  children: React.ReactNode
}) => {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed)

  React.useEffect(() => {
    if (containsActiveChannel) {
      setCollapsed(false)
      return
    }
    const saved = localStorage.getItem(storageKey)
    if (saved !== null) setCollapsed(saved === 'true')
  }, [containsActiveChannel, storageKey])

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
          fontSize: 12, fontWeight: 500, color: 'var(--text-3)',
          padding: '6px 10px',
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

export function formatChannelPeriod(start: string | null, end: string | null, startTime: string | null | undefined, endTime: string | null | undefined, t: TranslateFn): string | undefined {
  const f = (iso: string) => { const [, m, d] = iso.slice(0, 10).split('-').map(Number); return `${m}/${d}` }
  const st = formatTime(startTime ?? null)
  const et = formatTime(endTime ?? null)
  if (start && end) {
    const startLabel = `${f(start)}${st ? ` ${st}` : ''}`
    const endLabel = `${end === start ? '' : f(end)}${et ? `${end === start ? '' : ' '}${et}` : ''}`
    return endLabel ? t('{start}–{end}', { start: startLabel, end: endLabel }) : startLabel
  }
  if (end) return t('–{end}', { end: `${f(end)}${et ? ` ${et}` : ''}` })
  if (start) return t('{start}–', { start: `${f(start)}${st ? ` ${st}` : ''}` })
  return undefined
}

export const ChatSidebarItem = ({ active, onClick, prefix, avatar, avatarUrl, dot, label, dateMeta, unread, directMessage = false, pinned = false, mobile, memberNames, memberCount, action }: {
  active?: boolean; onClick?: () => void; prefix?: string
  avatar?: string; avatarUrl?: string; dot?: string; label: string; dateMeta?: string
  /** 未読件数。メンションのない新着は太字だけで示し、件数バッジは自分宛て（メンション・DM）だけに付ける */
  unread?: ChatUnreadCounts; directMessage?: boolean; mobile?: boolean
  /** ピン留め中。並び順に関係なく先頭に固定されている理由を示す */
  pinned?: boolean
  memberNames?: string[]; memberCount?: number
  action?: React.ReactNode
}) => {
  const t = useT()
  const unreadDisplay = unread ? chatUnreadDisplay(unread, { directMessage }) : null
  return (
  <div className="chat-sidebar-item" style={{ position: 'relative' }}>
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
      padding: mobile ? `11px ${action ? 52 : 16}px 11px 16px` : `6px ${action ? 38 : 10}px 6px 10px`,
      borderRadius: mobile ? 0 : 6,
      borderBottom: mobile ? '1px solid var(--divider)' : 'none',
      border: mobile ? undefined : 'none',
      background: active && !mobile ? 'var(--card-hover)' : 'transparent',
      // 新着は最大の太さに加えて文字色も一段明るくし、件数バッジがなくても一目で分かるようにする
      color: active || unreadDisplay?.unread ? 'var(--text)' : 'var(--text-2)',
      fontSize: mobile ? 15 : 13,
      fontWeight: unreadDisplay?.unread ? 600 : 400,
      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
    }}
      className={!active && !mobile ? 'hover-bg-card' : undefined}
    >
      {prefix === 'lock' || prefix === 'sparkles' ? (
        <span style={{ width: mobile ? 36 : 14, height: mobile ? 36 : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: mobile ? 8 : undefined, background: mobile ? 'var(--card-2)' : undefined, color: 'var(--text-3)' }}>
          <Icon name={prefix} size={mobile ? 18 : 12}/>
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
        {pinned && (
          <span role="img" aria-label={t('Pinned')} title={t('Pinned')} style={{ flexShrink: 0, display: 'inline-flex', alignSelf: 'center', color: 'var(--text-4)' }}>
            <Icon name="pin" size={mobile ? 13 : 11}/>
          </span>
        )}
        {dateMeta && (
          <span style={{ flexShrink: 0, fontSize: mobile ? 11 : 10, color: 'var(--text-4)', fontWeight: 500, whiteSpace: 'nowrap' }}>{dateMeta}</span>
        )}
      </span>
      {unreadDisplay && <UnreadBadge count={unreadDisplay.badgeCount} size={mobile ? 'md' : 'sm'} />}
      {memberNames && memberNames.length > 0 && mobile && (
        <AvatarStack names={memberNames} size={22} max={3}/>
      )}
      {memberCount != null && !mobile && memberCount > 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 500, flexShrink: 0 }}>{t('{count} members', { count: memberCount })}</span>
      )}
    </button>
    {action && (
      <div
        className="chat-sidebar-item-action"
        data-always-visible={mobile || undefined}
        style={{ position: 'absolute', top: '50%', right: mobile ? 8 : 5, transform: 'translateY(-50%)', display: 'flex', zIndex: 1 }}
      >
        {action}
      </div>
    )}
  </div>
  )
}

interface SidebarMenuAction {
  label: string
  icon: string
  onSelect: () => void
  restoreFocus?: boolean
  danger?: boolean
}

const SidebarCreateMenu = ({ ownerLabel, actions, isMobile }: {
  ownerLabel: string
  actions: SidebarMenuAction[]
  isMobile: boolean
}) => {
  const t = useT()
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
        aria-label={t('{name} menu', { name: ownerLabel })}
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
        className="hover-bg hover-text"
      >
        <Icon name="more" size={isMobile ? 18 : 15} strokeWidth={2}/>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('{name} actions', { name: ownerLabel })}
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
            zIndex: 'var(--z-popover)',
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
                border: 'none', borderRadius: 6, background: 'transparent', color: action.danger ? 'var(--red-text)' : 'var(--text-2)',
                cursor: 'pointer', padding: '0 9px', fontFamily: 'inherit', fontSize: 13, textAlign: 'left',
                whiteSpace: 'nowrap',
              }}
              className="hover-bg"
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
  const t = useT()
  const period = formatChannelPeriod(channel.startDate, channel.endDate, channel.startTime, channel.endTime, t)
  const completed = channel.milestoneCompleted === true
  const actions: SidebarMenuAction[] = []
  if (!completed && onEditMilestone) {
    actions.push({
      label: t('Edit'),
      icon: 'edit',
      onSelect: () => onEditMilestone(channel),
    })
  }
  if (onSetMilestoneCompleted) {
    actions.push({
      label: completed ? t('Mark incomplete') : t('Mark complete'),
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
        unread={channel}
        mobile={isMobile}
        action={actions.length > 0 ? (
          <SidebarCreateMenu ownerLabel={channel.channelName} actions={actions} isMobile={isMobile} />
        ) : undefined}
      />
    </div>
  )
}

function workspaceRowActions({
  channel,
  isThread,
  canManageParent,
  onCreateThread,
  onRename,
  onSetArchived,
  onDelete,
  t,
}: {
  channel: WorkspaceChannelDto
  isThread: boolean
  canManageParent: boolean
  onCreateThread?: (target: { id: string; name: string }) => void
  onRename?: (target: WorkspaceChannelDto) => void
  onSetArchived?: (target: WorkspaceChannelDto, archived: boolean) => void
  onDelete?: (target: WorkspaceChannelDto) => void
  t: TranslateFn
}): SidebarMenuAction[] {
  const actions: SidebarMenuAction[] = []
  if (!isThread && onCreateThread && channel.name) {
    actions.push({
      label: t('Create thread'),
      icon: 'chat',
      onSelect: () => onCreateThread({ id: channel.id, name: channel.name! }),
    })
  }
  if (isThread || canManageParent) {
    if (onRename) {
      actions.push({
        label: t('Rename'),
        icon: 'edit',
        onSelect: () => onRename(channel),
      })
    }
    if (onSetArchived) {
      actions.push({
        label: channel.archived ? t('Unarchive') : t('Archive'),
        icon: channel.archived ? 'refresh' : 'archive',
        onSelect: () => onSetArchived(channel, !channel.archived),
        restoreFocus: true,
      })
    }
    if (onDelete) {
      actions.push({
        label: t('Delete'),
        icon: 'trash',
        danger: true,
        onSelect: () => onDelete(channel),
      })
    }
  }
  return actions
}

const WorkspaceThreadItem = ({ channel, active, onSelectChannel, isMobile, actions }: {
  channel: WorkspaceChannelDto
  active: boolean
  onSelectChannel: (id: string) => void
  isMobile: boolean
  actions: SidebarMenuAction[]
}) => {
  const t = useT()
  const name = channel.name ?? t('Untitled thread')
  return (
  <div style={{ paddingLeft: isMobile ? 0 : 18 }}>
    <ChatSidebarItem
      active={active}
      onClick={() => onSelectChannel(channel.id)}
      prefix="┗"
      label={name}
      unread={channel}
      mobile={isMobile}
      memberNames={channel.memberNames}
      memberCount={channel.memberCount}
      action={actions.length > 0 ? (
        <SidebarCreateMenu ownerLabel={name} actions={actions} isMobile={isMobile} />
      ) : undefined}
    />
  </div>
  )
}

const ProjectChannelGroup = ({ general, activeMilestones, completedMilestones, channelId, onSelectChannel, onCreateMilestone, onEditMilestone, onSetMilestoneCompleted, pinned, onTogglePin, isMobile }: {
  general: ProjectChannelDto
  activeMilestones: ProjectChannelDto[]
  completedMilestones: ProjectChannelDto[]
  channelId: string | null
  onSelectChannel: (id: string) => void
  onCreateMilestone?: (project: { id: string; title: string }) => void
  onEditMilestone?: (milestone: ProjectChannelDto) => void
  onSetMilestoneCompleted?: (milestone: ProjectChannelDto, completed: boolean) => void
  pinned: boolean
  onTogglePin?: (projectId: string, pinned: boolean) => void
  isMobile: boolean
}) => {
  const t = useT()
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
  if (onTogglePin) {
    actions.push({
      label: pinned ? t('Unpin') : t('Pin'),
      icon: 'pin',
      onSelect: () => onTogglePin(general.projectId, !pinned),
      restoreFocus: true,
    })
  }
  if (onCreateMilestone) {
    actions.push({
      label: t('Create milestone'),
      icon: 'flag',
      onSelect: () => onCreateMilestone({ id: general.projectId, title: general.projectTitle }),
    })
  }
  if (completedMilestones.length > 0) {
    actions.push({
      label: t('Completed milestones: {state}', { state: collapsed ? t('Show') : t('Hide') }),
      icon: collapsed ? 'eye' : 'eye-off',
      onSelect: toggle,
      restoreFocus: true,
    })
  }

  const period = formatChannelPeriod(general.startDate, general.endDate, general.startTime, general.endTime, t)

  return (
    <>
      <ChatSidebarItem
        active={channelId === general.channelId}
        onClick={() => onSelectChannel(general.channelId)}
        prefix="#"
        label={general.projectTitle}
        {...(period ? { dateMeta: period } : {})}
        unread={general}
        pinned={pinned}
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
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const didInitialFocus = React.useRef(false)
  const [position, setPosition] = React.useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null)

  React.useLayoutEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const anchor = ref.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.max(0, Math.min(280, window.innerWidth - 16))
      const below = Math.max(0, window.innerHeight - rect.bottom - 12)
      const above = Math.max(0, rect.top - 12)
      const openAbove = below < 240 && above > below
      const maxHeight = Math.min(480, openAbove ? above : below)
      const maxLeft = Math.max(0, window.innerWidth - width - 8)
      setPosition({
        left: Math.max(Math.min(8, maxLeft), Math.min(rect.right - width, maxLeft)),
        width,
        ...(openAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
        maxHeight,
      })
    }
    const handleScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) updatePosition()
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [open])

  React.useEffect(() => {
    if (!open) {
      didInitialFocus.current = false
      return
    }
    if (!position) return
    const firstChoice = menuRef.current?.querySelector('button')
    const isInitialFocus = !didInitialFocus.current
    if (!isInitialFocus && document.activeElement !== menuRef.current) return
    didInitialFocus.current = true
    if (firstChoice) firstChoice.focus()
    else if (isInitialFocus) menuRef.current?.focus()
  }, [open, position, members.length])

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return
      event.preventDefault()
      if (menuRef.current?.contains(document.activeElement)) {
        ref.current?.querySelector('button')?.focus()
      }
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button onClick={() => setOpen(p => !p)} aria-label={t('Start a direct message')} aria-expanded={open} className={sectionAddButtonClass} style={sectionAddButtonStyle}>
        <Icon name="plus" size={13} strokeWidth={2.4} color="currentColor"/>
      </button>
      {open && portalHostFor(ref.current) && createPortal(
        <div ref={menuRef} className="app" style={{
          position: 'fixed', left: position?.left ?? 0,
          ...(position?.bottom !== undefined ? { bottom: position.bottom } : { top: position?.top ?? 0 }),
          width: position?.width ?? 0, boxSizing: 'border-box',
          maxHeight: position?.maxHeight ?? 0, overflowY: 'auto',
          visibility: position ? 'visible' : 'hidden',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: 'var(--shadow-pop)', zIndex: 'var(--z-popover)',
        }} tabIndex={-1}>
          {members.map(m => (
            <button
              key={m.userId}
              onClick={() => { setOpen(false); onStartDm(m.userId) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
              className="hover-bg"
            >
              <Avatar name={m.displayName} url={m.avatarUrl ?? null} size={20}/>
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{m.displayName}</span>
            </button>
          ))}
        </div>, portalHostFor(ref.current)!,
      )}
    </div>
  )
}

const WorkspaceChannelGroup = ({ channel, threads, archivedThreads, channelId, onSelectChannel, isMobile, channelActions, threadActions }: {
  channel: WorkspaceChannelDto
  threads: WorkspaceChannelDto[]
  archivedThreads: WorkspaceChannelDto[]
  channelId: string | null
  onSelectChannel: (id: string) => void
  isMobile: boolean
  channelActions: SidebarMenuAction[]
  threadActions: (thread: WorkspaceChannelDto) => SidebarMenuAction[]
}) => {
  const t = useT()
  const storageKey = chatArchivedThreadsCollapsedKey(channel.id)
  const containsActiveChannel = archivedThreads.some(thread => thread.id === channelId)
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

  const actions = [...channelActions]
  if (archivedThreads.length > 0) {
    actions.push({
      label: t('Archived threads: {state}', { state: collapsed ? t('Show') : t('Hide') }),
      icon: collapsed ? 'eye' : 'eye-off',
      onSelect: toggle,
      restoreFocus: true,
    })
  }

  return (
    <>
      <ChatSidebarItem
        active={channelId === channel.id}
        onClick={() => onSelectChannel(channel.id)}
        prefix={channel.isPrivate ? 'lock' : '#'}
        label={channel.name ?? ''}
        unread={channel}
        mobile={isMobile}
        memberNames={channel.memberNames}
        memberCount={channel.memberCount}
        action={actions.length > 0 ? (
          <SidebarCreateMenu
            ownerLabel={channel.name ?? t('Untitled channel')}
            actions={actions}
            isMobile={isMobile}
          />
        ) : undefined}
      />
      {[...threads, ...(collapsed ? [] : archivedThreads)].map(thread => (
        <WorkspaceThreadItem
          key={thread.id}
          channel={thread}
          active={channelId === thread.id}
          onSelectChannel={onSelectChannel}
          isMobile={isMobile}
          actions={threadActions(thread)}
        />
      ))}
    </>
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
  onAddProject?: () => void
  onAddChannel?: () => void
  onStartDm: (userId: string) => void
  onCreateMilestone?: (project: { id: string; title: string }) => void
  onEditMilestone?: (milestone: ProjectChannelDto) => void
  onSetMilestoneCompleted?: (milestone: ProjectChannelDto, completed: boolean) => void
  onCreateThread?: (channel: { id: string; name: string }) => void
  onRenameWorkspaceChannel?: (channel: WorkspaceChannelDto) => void
  onSetWorkspaceChannelArchived?: (channel: WorkspaceChannelDto, archived: boolean) => void
  onDeleteWorkspaceChannel?: (channel: WorkspaceChannelDto) => void
  canManageWorkspaceChannel?: boolean
  /** セクションごとの並び順。アーカイブ欄と、親の下のマイルストーン・スレッドは並べ替えない */
  sorts?: Record<ChatListSection, ChatListSort>
  /** 渡すと各セクション見出しの「＋」の左に並び替えボタンを出す */
  onChangeSort?: (section: ChatListSection, sort: ChatListSort) => void
  /** ピン留め中のプロジェクト（サイドバーのピン留めと同じもの）。プロジェクト欄の先頭に固定する */
  pinnedProjectIds?: ReadonlySet<string>
  onTogglePinProject?: (projectId: string, pinned: boolean) => void
  /** ピン留めの取得に失敗したときのエラー文。未ピン扱いで黙って並べず、プロジェクト欄に出す */
  pinnedProjectsError?: string
}

const NO_PINNED_PROJECTS: ReadonlySet<string> = new Set()

// ─── 一覧の並び（描画と ⌥↑↓ の順送りで共有） ─────────────────────────

export interface ChannelListSectionsInput {
  projectChannels: ProjectChannelDto[]
  workspaceChannels: WorkspaceChannelDto[]
  dms: DmChannelDto[]
  sorts?: Record<ChatListSection, ChatListSort>
  pinnedProjectIds?: ReadonlySet<string>
}

/** 一覧の各セクションを、選んだ並び順・ピン留めで組み立てる。画面の並びと順送りの順序をここで一致させる */
export function buildChannelListSections({
  projectChannels, workspaceChannels, dms, sorts = DEFAULT_CHAT_LIST_SORTS, pinnedProjectIds = NO_PINNED_PROJECTS,
}: ChannelListSectionsInput) {
  const activeProjectChannels = projectChannels.filter(c => !c.archived)
  const archivedProjectChannels = projectChannels.filter(c => c.archived && c.milestoneId === null)
  const projectGroups = sortChatList(activeProjectChannels
    .filter(c => c.milestoneId === null)
    .map(general => {
      const milestones = activeProjectChannels.filter(c => c.projectId === general.projectId && c.milestoneId !== null)
      return {
        general,
        activeMilestones: milestones.filter(c => c.milestoneCompleted !== true),
        completedMilestones: milestones.filter(c => c.milestoneCompleted === true),
        lastMessageAt: latestMessageAt([general.lastMessageAt, ...milestones.map(c => c.lastMessageAt)]),
      }
    }), sorts.projects, {
    name: group => group.general.projectTitle,
    lastMessageAt: group => group.lastMessageAt,
    startDate: group => group.general.startDate,
    pinned: group => pinnedProjectIds.has(group.general.projectId),
  })
  const parentWorkspaceChannels = workspaceChannels.filter(channel => channel.parentChannelId === null)
  const activeParentChannels = parentWorkspaceChannels.filter(channel => !channel.archived)
  const archivedParentChannels = parentWorkspaceChannels.filter(channel => channel.archived)
  // アーカイブ済みチャンネルの配下スレッドはサイドバーに出さない（親と一緒にアーカイブ扱い）。
  const workspaceChannelGroups = sortChatList(activeParentChannels.map(channel => {
    const children = workspaceChannels.filter(candidate => candidate.parentChannelId === channel.id)
    return {
      channel,
      threads: children.filter(candidate => !candidate.archived),
      archivedThreads: children.filter(candidate => candidate.archived),
      lastMessageAt: latestMessageAt([channel.lastMessageAt, ...children.map(child => child.lastMessageAt)]),
    }
  }), sorts.channels, {
    name: group => group.channel.name ?? '',
    lastMessageAt: group => group.lastMessageAt,
  })
  const sortedDms = sortChatList(dms, sorts.dms, {
    name: dm => dm.participantName,
    lastMessageAt: dm => dm.lastMessageAt,
  })
  return { projectGroups, archivedProjectChannels, workspaceChannelGroups, archivedParentChannels, sortedDms }
}

/** 既定で表示される会話を、画面の上から順に並べた ID。⌥↑↓ の順送りに使う（畳まれたアーカイブ・完了済みは含めない） */
export function orderedVisibleChannelIds(input: ChannelListSectionsInput): string[] {
  const { projectGroups, workspaceChannelGroups, sortedDms } = buildChannelListSections(input)
  return [
    ...projectGroups.flatMap(group => [group.general.channelId, ...group.activeMilestones.map(channel => channel.channelId)]),
    ...workspaceChannelGroups.flatMap(group => [group.channel.id, ...group.threads.map(thread => thread.id)]),
    ...sortedDms.map(dm => dm.id),
  ]
}


export const ChannelList = ({
  channelId, onSelectChannel, projectChannels, workspaceChannels,
  dms, members, isMobile = false, onAddProject, onAddChannel, onStartDm, onCreateMilestone, onEditMilestone,
  onSetMilestoneCompleted, onCreateThread, onRenameWorkspaceChannel, onSetWorkspaceChannelArchived, onDeleteWorkspaceChannel,
  canManageWorkspaceChannel = false, sorts = DEFAULT_CHAT_LIST_SORTS, onChangeSort, pinnedProjectIds = NO_PINNED_PROJECTS, onTogglePinProject, pinnedProjectsError,
}: ChannelListProps) => {
  const t = useT()
  const { projectGroups, archivedProjectChannels, workspaceChannelGroups, archivedParentChannels, sortedDms } = buildChannelListSections({
    projectChannels, workspaceChannels, dms, sorts, pinnedProjectIds,
  })
  const sortMenu = (section: ChatListSection, title: string) => onChangeSort
    ? <ChatListSortMenu section={section} title={title} sort={sorts[section]} onChange={sort => onChangeSort(section, sort)}/>
    : undefined
  const archivedProjectsContainActive = channelId !== null && archivedProjectChannels.some(c => c.channelId === channelId)
  const archivedChannelsContainActive = channelId !== null && archivedParentChannels.some(c => c.id === channelId)
  const parentChannelActions = (channel: WorkspaceChannelDto, withCreateThread: boolean) => workspaceRowActions({
    channel,
    isThread: false,
    canManageParent: canManageWorkspaceChannel,
    ...(withCreateThread && onCreateThread ? { onCreateThread } : {}),
    ...(onRenameWorkspaceChannel ? { onRename: onRenameWorkspaceChannel } : {}),
    ...(onSetWorkspaceChannelArchived ? { onSetArchived: onSetWorkspaceChannelArchived } : {}),
    ...(onDeleteWorkspaceChannel ? { onDelete: onDeleteWorkspaceChannel } : {}),
    t,
  })
  const threadActions = (thread: WorkspaceChannelDto) => workspaceRowActions({
    channel: thread,
    isThread: true,
    canManageParent: canManageWorkspaceChannel,
    ...(onRenameWorkspaceChannel ? { onRename: onRenameWorkspaceChannel } : {}),
    ...(onSetWorkspaceChannelArchived ? { onSetArchived: onSetWorkspaceChannelArchived } : {}),
    ...(onDeleteWorkspaceChannel ? { onDelete: onDeleteWorkspaceChannel } : {}),
    t,
  })
  return (
  <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '8px 0' : '8px 6px', paddingBottom: isMobile ? 'var(--mobile-nav-clearance)' : undefined }}>
    <ChatSidebarSection title={t('Projects')} {...(onAddProject ? { onAdd: onAddProject } : {})} sortMenu={sortMenu('projects', t('Projects'))}>
      {pinnedProjectsError && (
        <div role="alert" style={{ padding: '4px 10px 6px', fontSize: 12, color: 'var(--red-text)' }}>{pinnedProjectsError}</div>
      )}
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
          pinned={pinnedProjectIds.has(general.projectId)}
          {...(onTogglePinProject ? { onTogglePin: onTogglePinProject } : {})}
          isMobile={isMobile}
        />
      ))}
    </ChatSidebarSection>
    {archivedProjectChannels.length > 0 && (
      <ChatSidebarCollapsibleSection title={t('Archived projects')} count={archivedProjectChannels.length} containsActiveChannel={archivedProjectsContainActive}>
        {archivedProjectChannels.map(c => (
          <ChatSidebarItem key={c.channelId} active={channelId === c.channelId} onClick={() => onSelectChannel(c.channelId)} prefix="#" label={c.projectTitle} unread={c} mobile={isMobile}/>
        ))}
      </ChatSidebarCollapsibleSection>
    )}
    <ChatSidebarSection title={t('Channels')} {...(onAddChannel ? { onAdd: onAddChannel } : {})} sortMenu={sortMenu('channels', t('Channels'))}>
      {workspaceChannelGroups.map(({ channel, threads, archivedThreads }) => (
        <WorkspaceChannelGroup
          key={channel.id}
          channel={channel}
          threads={threads}
          archivedThreads={archivedThreads}
          channelId={channelId}
          onSelectChannel={onSelectChannel}
          isMobile={isMobile}
          channelActions={parentChannelActions(channel, true)}
          threadActions={threadActions}
        />
      ))}
    </ChatSidebarSection>
    {archivedParentChannels.length > 0 && (
      <ChatSidebarCollapsibleSection title={t('Archived channels')} count={archivedParentChannels.length} storageKey={STORAGE_KEYS.chat_archived_channels_collapsed} containsActiveChannel={archivedChannelsContainActive}>
        {archivedParentChannels.map(channel => {
          const actions = parentChannelActions(channel, false)
          return (
            <ChatSidebarItem
              key={channel.id}
              active={channelId === channel.id}
              onClick={() => onSelectChannel(channel.id)}
              prefix={channel.isPrivate ? 'lock' : '#'}
              label={channel.name ?? ''}
              unread={channel}
              mobile={isMobile}
              memberNames={channel.memberNames}
              memberCount={channel.memberCount}
              action={actions.length > 0 ? (
                <SidebarCreateMenu ownerLabel={channel.name ?? t('Untitled channel')} actions={actions} isMobile={isMobile} />
              ) : undefined}
            />
          )
        })}
      </ChatSidebarCollapsibleSection>
    )}
    {FEATURE_FLAGS.dm && (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <span>{t('Direct messages')}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            {sortMenu('dms', t('Direct messages'))}
            <DmPicker members={members} onStartDm={onStartDm}/>
          </span>
        </div>
        <div>
          {sortedDms.map(d => (
            <ChatSidebarItem key={d.id} active={channelId === d.id} onClick={() => onSelectChannel(d.id)} avatar={d.participantName} {...(d.participantAvatarUrl ? { avatarUrl: d.participantAvatarUrl } : {})} label={d.participantName} unread={d} directMessage mobile={isMobile}/>
          ))}
        </div>
      </div>
    )}
    <ChatSidebarSection title={t('Apps')}>
      <ChatSidebarItem prefix="sparkles" label={t('AI assistant')} mobile={isMobile} />
    </ChatSidebarSection>
  </div>
  )
}
