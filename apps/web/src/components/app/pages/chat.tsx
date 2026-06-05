'use client'

import React from 'react'
import { Icon, Avatar, AvatarStack, StatusChip } from '../primitives'
import { MobileHeader } from '../mobile/header'
import { ChatThread } from '../chat-thread'
import { useQuery } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'
import type { MessageSearchResultDto } from '@/app/api/search/messages/route'
import {
  useProjectChannels,
  useWorkspaceChannels,
  useWorkspaceMembers,
  useWorkspaceDms,
  useChannelMembers,
  useCreateDm,
  useMarkChannelRead,
  useCurrentUser,
} from '@/lib/chat/client'
import { CreateChannelSheet } from '../mobile/create-channel-sheet'
import { CreateChannelModal } from './create-channel-modal'
import { ChannelMemberSheet } from '../mobile/channel-member-sheet'

// ─── Sidebar ─────────────────────────────────────────────────────

const ChatSidebarSection = ({ title, children, onAdd }: { title: string; children: React.ReactNode; onAdd?: () => void }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '6px 10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{title}</span>
      <button
        onClick={onAdd}
        style={{ background: 'transparent', border: 'none', cursor: onAdd ? 'pointer' : 'default', color: 'var(--text-4)', padding: 2, lineHeight: 1 }}
      >
        <Icon name="plus" size={11} color="var(--text-4)"/>
      </button>
    </div>
    <div>{children}</div>
  </div>
)

const ChatSidebarItem = ({ active, onClick, prefix, avatar, avatarUrl, dot, label, badge, mobile, memberNames, memberCount }: {
  active?: boolean; onClick?: () => void; prefix?: string
  avatar?: string; avatarUrl?: string; dot?: string; label: string; badge?: number; mobile?: boolean
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
    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    {badge != null && badge > 0 && (
      <span style={{ background: 'var(--accent)', color: 'var(--on-accent)', fontSize: mobile ? 12 : 10, fontWeight: 700, padding: mobile ? '2px 8px' : '1px 6px', borderRadius: 999, minWidth: 20, textAlign: 'center' }}>{badge}</span>
    )}
    {memberNames && memberNames.length > 0 && mobile && (
      <AvatarStack names={memberNames} size={22} max={3}/>
    )}
    {memberCount != null && !mobile && memberCount > 0 && (
      <span style={{ fontSize: 10.5, color: 'var(--text-4)', fontWeight: 500, flexShrink: 0 }}>{memberCount}名</span>
    )}
    {mobile && <Icon name="chevRight" size={16} color="var(--text-4)"/>}
  </button>
)

// ─── Message search ───────────────────────────────────────────────

function useDebounce(value: string, ms: number) {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function highlightMatch(text: string, query: string) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function formatSearchDate(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface ChatMessageSearchProps {
  channelId: string
  onClose: () => void
  onJump: (messageId: string) => void
  isMobile?: boolean
}

const ChatMessageSearch = ({ channelId, onClose, onJump, isMobile = false }: ChatMessageSearchProps) => {
  const [query, setQuery] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const debouncedQuery = useDebounce(query, 400)

  React.useEffect(() => { inputRef.current?.focus() }, [])

  const { data: results = [], isFetching } = useQuery<MessageDto[]>({
    queryKey: ['message-search', channelId, debouncedQuery],
    queryFn: () => fetchWithAuth(`/api/channels/${channelId}/messages/search?q=${encodeURIComponent(debouncedQuery)}`).then(r => r.json()),
    enabled: debouncedQuery.length >= 1,
  })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Search input bar */}
      <div style={{ padding: isMobile ? '8px 12px' : '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', flexShrink: 0 }}>
        <Icon name="search" size={14} color="var(--text-3)"/>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="メッセージを検索…"
          style={{ flex: 1, fontSize: 13, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', caretColor: 'var(--accent)' }}
          onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        />
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-3)', padding: 2 }}>
          <Icon name="close" size={14}/>
        </button>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '8px 0' : '8px 0' }}>
        {!debouncedQuery ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
            キーワードを入力してください
          </div>
        ) : isFetching ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
            検索中…
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
            「{debouncedQuery}」に一致するメッセージはありません
          </div>
        ) : (
          <>
            <div style={{ padding: '6px 16px 2px', fontSize: 11, color: 'var(--text-4)', fontWeight: 600 }}>
              {results.length} 件{results.length === 50 ? '以上' : ''}
            </div>
            {results.map(msg => (
              <div
                key={msg.id}
                role="button"
                tabIndex={0}
                onClick={() => onJump(msg.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onJump(msg.id) }}
                style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--divider)',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>{msg.senderName}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{formatSearchDate(msg.createdAt)}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                  {highlightMatch(msg.content, debouncedQuery)}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Cross-channel search ─────────────────────────────────────────

interface CrossChannelSearchProps {
  onClose: () => void
  onJump: (channelId: string, messageId: string) => void
  isMobile?: boolean
}

const CrossChannelSearch = ({ onClose, onJump, isMobile = false }: CrossChannelSearchProps) => {
  const [query, setQuery] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const debouncedQuery = useDebounce(query, 400)

  React.useEffect(() => { inputRef.current?.focus() }, [])

  const { data: results = [], isFetching } = useQuery<MessageSearchResultDto[]>({
    queryKey: ['global-message-search', debouncedQuery],
    queryFn: () => fetchWithAuth(`/api/search/messages?q=${encodeURIComponent(debouncedQuery)}`).then(r => r.json()),
    enabled: debouncedQuery.length >= 1,
  })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Search input bar */}
      <div style={{ padding: isMobile ? '8px 12px' : '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', flexShrink: 0 }}>
        <Icon name="search" size={14} color="var(--accent)"/>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="全チャンネルを横断検索…"
          style={{ flex: 1, fontSize: 13, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', caretColor: 'var(--accent)' }}
          onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        />
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-3)', padding: 2 }}>
          <Icon name="close" size={14}/>
        </button>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {!debouncedQuery ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
            キーワードを入力してください
          </div>
        ) : isFetching ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
            検索中…
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
            「{debouncedQuery}」に一致するメッセージはありません
          </div>
        ) : (
          <>
            <div style={{ padding: '6px 16px 2px', fontSize: 11, color: 'var(--text-4)', fontWeight: 600 }}>
              {results.length} 件{results.length === 50 ? '以上' : ''}
            </div>
            {results.map(msg => (
              <div
                key={msg.id}
                role="button"
                tabIndex={0}
                onClick={() => onJump(msg.channelId, msg.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onJump(msg.channelId, msg.id) }}
                style={{ padding: '10px 16px', borderBottom: '1px solid var(--divider)', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--accent-text)', background: 'var(--accent-soft)', padding: '1px 6px', borderRadius: 999 }}>
                    {msg.channelName}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>{msg.senderName}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{formatSearchDate(msg.createdAt)}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                  {highlightMatch(msg.content, debouncedQuery)}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ─── PageChat ─────────────────────────────────────────────────────

export const PageChat = ({ isMobile = false }: { isMobile?: boolean }) => {
  const [channelId, setChannelId] = React.useState<string | null>(null)
  const [activePane, setActivePane] = React.useState<'list' | 'thread'>('list')
  const [showMemberPicker, setShowMemberPicker] = React.useState(false)
  const [showCreateChannel, setShowCreateChannel] = React.useState(false)
  const [showMemberInvite, setShowMemberInvite] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [globalSearchOpen, setGlobalSearchOpen] = React.useState(false)
  const [targetMessageId, setTargetMessageId] = React.useState<string | null>(null)
  const memberPickerRef = React.useRef<HTMLDivElement>(null)

  const { data: projectChannels = [] } = useProjectChannels()
  const { data: workspaceChannels = [] } = useWorkspaceChannels()
  const { data: members = [] } = useWorkspaceMembers()
  const { data: dms = [] } = useWorkspaceDms()
  const markChannelRead = useMarkChannelRead()
  const createDmMutation = useCreateDm()

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (memberPickerRef.current && !memberPickerRef.current.contains(e.target as Node)) {
        setShowMemberPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  React.useEffect(() => {
    if (!channelId && projectChannels.length > 0 && !isMobile) {
      setChannelId(projectChannels[0]!.channelId)
    }
  }, [channelId, projectChannels, isMobile])

  const selectChannel = (id: string) => {
    setChannelId(id)
    setSearchOpen(false)
    setGlobalSearchOpen(false)
    setTargetMessageId(null)
    if (isMobile) setActivePane('thread')
    markChannelRead.mutate(id)
  }

  const jumpToMessage = (messageId: string) => {
    setSearchOpen(false)
    setTargetMessageId(messageId)
  }

  const jumpToChannelMessage = (channelId: string, messageId: string) => {
    setGlobalSearchOpen(false)
    setChannelId(channelId)
    setTargetMessageId(messageId)
    if (isMobile) setActivePane('thread')
    markChannelRead.mutate(channelId)
  }

  const startDm = (targetUserId: string) => {
    setShowMemberPicker(false)
    createDmMutation.mutate(targetUserId, {
      onSuccess: (data) => selectChannel(data.id),
    })
  }

  const currentChannel = projectChannels.find(c => c.channelId === channelId)
  const currentGeneral = workspaceChannels.find(c => c.id === channelId)
  const currentDm = dms.find(d => d.id === channelId)
  const isProject = !!currentChannel
  const isPrivate = !!(currentGeneral?.isPrivate)
  const isDm = !!currentDm
  const channelName = currentChannel?.projectTitle ?? currentGeneral?.name ?? currentDm?.participantName ?? ''
  const currentChannelMemberCount = currentGeneral?.memberCount

  const { data: currentUser } = useCurrentUser()
  const { data: channelMemberIds = [] } = useChannelMembers(isProject || isPrivate ? channelId : null)

  const channelMembers = React.useMemo<{ name: string; url: string | null }[]>(() => {
    if (isDm) {
      return [
        { name: currentDm.participantName, url: currentDm.participantAvatarUrl ?? null },
        ...(currentUser ? [{ name: currentUser.displayName, url: currentUser.avatarUrl ?? null }] : []),
      ]
    }
    if (isProject || isPrivate) {
      const idSet = new Set(channelMemberIds.map(m => m.userId))
      return members.filter(m => idSet.has(m.userId)).map(m => ({ name: m.displayName, url: m.avatarUrl ?? null }))
    }
    const names = currentGeneral?.memberNames ?? []
    const urls = currentGeneral?.memberAvatarUrls ?? []
    return names.map((name, i) => ({ name, url: urls[i] ?? null }))
  }, [isDm, isProject, isPrivate, currentDm, currentUser, channelMemberIds, members, currentGeneral])

  const memberNames = channelMembers.map(m => m.name)
  const memberAvatarUrls = channelMembers.map(m => m.url)

  // ─── DM メンバーピッカー ────────────────────────────────────────
  const dmPicker = (
    <div style={{ position: 'relative' }} ref={memberPickerRef}>
      <button onClick={() => setShowMemberPicker(p => !p)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: 2, lineHeight: 1 }}>
        <Icon name="plus" size={11} color="var(--text-4)"/>
      </button>
      {showMemberPicker && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 50, minWidth: 160, overflow: 'hidden' }}>
          {members.map(m => (
            <button key={m.userId} onClick={() => startDm(m.userId)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
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

  // ─── チャンネル一覧 ────────────────────────────────────────────
  const channelList = (
    <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '8px 0' : '8px 6px', paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom))' : undefined }}>
      <ChatSidebarSection title="プロジェクト">
        {projectChannels.map(c => (
          <ChatSidebarItem key={c.channelId} active={channelId === c.channelId} onClick={() => selectChannel(c.channelId)} prefix="#" label={c.projectTitle} badge={c.unreadCount} mobile={isMobile}/>
        ))}
      </ChatSidebarSection>
      <ChatSidebarSection title="チャンネル" onAdd={() => setShowCreateChannel(true)}>
        {workspaceChannels.map(c => (
          <ChatSidebarItem key={c.id} active={channelId === c.id} onClick={() => selectChannel(c.id)} prefix={c.isPrivate ? 'lock' : '#'} label={c.name ?? ''} badge={c.unreadCount} mobile={isMobile} memberNames={c.memberNames} memberCount={c.memberCount}/>
        ))}
      </ChatSidebarSection>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '6px 10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>ダイレクトメッセージ</span>
          {dmPicker}
        </div>
        <div>
          {dms.map(d => (
            <ChatSidebarItem key={d.id} active={channelId === d.id} onClick={() => selectChannel(d.id)} avatar={d.participantName} {...(d.participantAvatarUrl ? { avatarUrl: d.participantAvatarUrl } : {})} label={d.participantName} badge={d.unreadCount} mobile={isMobile}/>
          ))}
        </div>
      </div>
      <ChatSidebarSection title="アプリ">
        <ChatSidebarItem prefix="✨" label="AIアシスタント" mobile={isMobile}/>
      </ChatSidebarSection>
    </div>
  )

  const createChannelUI = showCreateChannel && (
    isMobile
      ? <CreateChannelSheet onClose={() => setShowCreateChannel(false)} onCreated={(channel) => selectChannel(channel.id)}/>
      : <CreateChannelModal onClose={() => setShowCreateChannel(false)} onCreated={(channel) => selectChannel(channel.id)}/>
  )

  // ─── モバイル ─────────────────────────────────────────────────
  if (isMobile) {
    if (activePane === 'list') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
          <MobileHeader
            title="チャット"
            right={
              <button className="btn" onClick={() => setGlobalSearchOpen(s => !s)} style={{ background: globalSearchOpen ? 'var(--card-hover)' : undefined }}>
                <Icon name="search" size={16}/>
              </button>
            }
          />
          {globalSearchOpen
            ? <CrossChannelSearch onClose={() => setGlobalSearchOpen(false)} onJump={jumpToChannelMessage} isMobile/>
            : channelList
          }
          {createChannelUI}
        </div>
      )
    }
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        <MobileHeader
          title={channelName}
          subtitle={currentChannelMemberCount != null ? `${currentChannelMemberCount}名が参加中` : undefined}
          onBack={() => setActivePane('list')}
          right={
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn" onClick={() => setSearchOpen(s => !s)} style={{ background: searchOpen ? 'var(--card-hover)' : undefined }}><Icon name="search" size={16}/></button>
              {isPrivate && (
                <button className="btn" onClick={() => setShowMemberInvite(true)}>
                  <Icon name="userPlus" size={16}/>
                </button>
              )}
              <button className="btn"><Icon name="more" size={17}/></button>
            </div>
          }
        />
        {searchOpen && channelId
          ? <ChatMessageSearch channelId={channelId} onClose={() => setSearchOpen(false)} onJump={jumpToMessage} isMobile={isMobile}/>
          : <ChatThread channelId={channelId} channelName={channelName} isPrivate={isPrivate} isMobile={isMobile} targetMessageId={targetMessageId}/>
        }
        {showMemberInvite && channelId && (
          <ChannelMemberSheet channelId={channelId} onClose={() => setShowMemberInvite(false)}/>
        )}
      </div>
    )
  }

  // ─── PC（3カラム）─────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {createChannelUI}
      <aside style={{ width: 240, background: 'var(--card-2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>チャット</h2>
          <button
            className="btn"
            onClick={() => setGlobalSearchOpen(s => !s)}
            style={{ background: globalSearchOpen ? 'var(--card-hover)' : undefined }}
            title="全チャンネル検索"
          >
            <Icon name="search" size={13}/>
          </button>
        </div>
        {channelList}
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
        {globalSearchOpen ? (
          <CrossChannelSearch onClose={() => setGlobalSearchOpen(false)} onJump={jumpToChannelMessage}/>
        ) : (
          <>
            <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {isDm ? <Avatar name={channelName} url={currentDm?.participantAvatarUrl ?? null} size={20}/> : isPrivate ? <Icon name="lock" size={13} color="var(--text-3)"/> : <span style={{ color: 'var(--text-3)' }}>#</span>}
                    {channelName}
                  </h2>
                  {isProject && <StatusChip name="計画中" color="#3B82F6"/>}
                  {isPrivate && <span className="chip" style={{ background: 'var(--amber-soft)', color: 'var(--amber-text)' }}><Icon name="lock" size={9}/> プライベート</span>}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                  {isProject ? '参加メンバー' : isDm ? 'ダイレクトメッセージ' : isPrivate ? '招待制' : '全体チャンネル'}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AvatarStack names={memberNames} urls={memberAvatarUrls} size={26} max={5}/>
                <button className="btn" onClick={() => setSearchOpen(s => !s)} style={{ background: searchOpen ? 'var(--card-hover)' : undefined }}><Icon name="search" size={13}/></button>
                <button className="btn"><Icon name="bell" size={13}/></button>
                <button className="btn"><Icon name="more" size={14}/></button>
              </div>
            </div>
            {searchOpen && channelId
              ? <ChatMessageSearch channelId={channelId} onClose={() => setSearchOpen(false)} onJump={jumpToMessage} isMobile={isMobile}/>
              : <ChatThread channelId={channelId} channelName={channelName} isPrivate={isPrivate} isMobile={isMobile} targetMessageId={targetMessageId}/>
            }
          </>
        )}
      </main>

      <aside style={{ width: 280, background: 'var(--card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{isProject ? 'このプロジェクトについて' : isDm ? 'ダイレクトメッセージ' : 'このチャンネルについて'}</h3>
        </div>
        {isProject ? (
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{channelName}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>プロジェクトチャンネル</div>
          </div>
        ) : (
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isPrivate ? <Icon name="lock" size={14} color="var(--amber-text)"/> : <Icon name="hash" size={14} color="var(--text-3)"/>}
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{channelName}</span>
            </div>
            {isPrivate && (
              <>
                <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--amber-soft)', border: '1px solid var(--amber)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="lock" size={12} color="var(--amber-text)"/>
                  <span style={{ fontSize: 11.5, color: 'var(--amber-text)', fontWeight: 600 }}>招待されたメンバーのみが閲覧できます</span>
                </div>
                <button
                  onClick={() => setShowMemberInvite(true)}
                  style={{
                    marginTop: 10, width: '100%', height: 34, borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--card-2)',
                    color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <Icon name="userPlus" size={13}/>
                  メンバーを招待
                </button>
                {showMemberInvite && channelId && (
                  <ChannelMemberSheet channelId={channelId} onClose={() => setShowMemberInvite(false)}/>
                )}
              </>
            )}
          </div>
        )}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>ピン留め</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '4px 0' }}>ピン留めはまだありません</div>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>メンバー</div>
          {channelMembers.slice(0, 6).map((m, i) => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
              <div style={{ position: 'relative' }}>
                <Avatar name={m.name} url={m.url} size={24}/>
                <span style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: '50%', background: i < 3 ? 'var(--accent)' : 'var(--text-4)', border: '2px solid var(--card)' }}/>
              </div>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', flex: 1 }}>{m.name}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
