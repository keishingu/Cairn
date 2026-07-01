'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Icon, Avatar, AvatarStack, StatusChip } from '../primitives'
import { MobileHeader } from '../mobile/header'
import { ChatThread } from '../chat-thread'
import { useQuery } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'
import type { MessageSearchResultDto } from '@/app/api/search/messages/route'
import type { BookmarkDto } from '@/app/api/me/bookmarks/route'
import {
  useProjectChannels,
  useWorkspaceChannels,
  useWorkspaceMembers,
  useWorkspaceDms,
  useChannelMembers,
  useCreateDm,
  useMarkChannelRead,
  useCurrentUser,
  useBookmarks,
} from '@/lib/chat/client'
import { CreateChannelSheet } from '../mobile/create-channel-sheet'
import { ChannelMemberSheet } from '../mobile/channel-member-sheet'
import { CreateChannelModal } from './create-channel-modal'
import { BellButton } from '../sidebar'
import { useDebounce } from '@/hooks/use-debounce'
import { ChannelList } from './chat-channel-list'
import { ChatDetailSidebar, ChatInfoDrawer, type ChatDetailMember } from './chat-detail-sidebar'
import { useAppShell } from '../app-shell-context'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectMemberDto } from '@/app/api/projects/[id]/members/route'
import { stripMentionsToText } from '@/lib/chat/mentions'
import { useCommand } from '@/lib/command-registry'
import {
  getLastVisitedChatChannelId,
  resolveInitialChatChannelId,
  setLastVisitedChatChannelId,
} from '@/lib/chat-last-channel'

// ─── Message search ───────────────────────────────────────────────

function highlightMatch(rawText: string, query: string) {
  // 検索スニペットでも構造化メンションを素のトークンで見せず @表示名 に整形する
  const text = stripMentionsToText(rawText)
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

async function fetchSearchResults<T>(url: string, fallbackMessage: string): Promise<T> {
  const res = await fetchWithAuth(url)
  if (!res.ok) {
    let message = fallbackMessage
    try {
      const body = await res.json() as { error?: string }
      if (body.error) message = body.error
    } catch {
      // JSON 以外の失敗レスポンスでも既定メッセージで扱う
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

const ChatMessageSearch = ({ channelId, onClose, onJump, isMobile = false }: ChatMessageSearchProps) => {
  const [query, setQuery] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const debouncedQuery = useDebounce(query, 400)

  React.useEffect(() => { inputRef.current?.focus() }, [])

  const { data: results = [], isFetching, isError } = useQuery<MessageDto[]>({
    queryKey: ['message-search', channelId, debouncedQuery],
    queryFn: () => fetchSearchResults<MessageDto[]>(
      `/api/channels/${channelId}/messages/search?q=${encodeURIComponent(debouncedQuery)}`,
      'チャンネル内検索に失敗しました',
    ),
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
        ) : isError ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--red-text)', fontSize: 13 }}>
            検索に失敗しました
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

  const { data: results = [], isFetching, isError } = useQuery<MessageSearchResultDto[]>({
    queryKey: ['global-message-search', debouncedQuery],
    queryFn: () => fetchSearchResults<MessageSearchResultDto[]>(
      `/api/search/messages?q=${encodeURIComponent(debouncedQuery)}`,
      '全チャンネル検索に失敗しました',
    ),
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
        ) : isError ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--red-text)', fontSize: 13 }}>
            検索に失敗しました
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

// ─── Bookmarks panel ──────────────────────────────────────────────

interface BookmarksPanelProps {
  onClose: () => void
  onJump: (channelId: string, messageId: string) => void
  isMobile?: boolean
}

const BookmarksPanel = ({ onClose, onJump, isMobile = false }: BookmarksPanelProps) => {
  const { data: bookmarks = [], isFetching } = useBookmarks(true)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: isMobile ? '8px 12px' : '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', flexShrink: 0 }}>
        <Icon name="bookmark" size={14} color="var(--accent)"/>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>ブックマーク</span>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-3)', padding: 2 }}>
          <Icon name="close" size={14}/>
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {isFetching && bookmarks.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>読み込み中…</div>
        ) : bookmarks.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
            ブックマークしたメッセージはまだありません
          </div>
        ) : (
          bookmarks.map((msg: BookmarkDto) => (
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
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {msg.content.replace(/<@[^|>\s]+\|([^>\n]+)>/g, '@$1')}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Pending cross-channel jump (survives component remount) ─────
let _pendingJump: { channelId: string; messageId: string } | null = null

// ─── PageChat ─────────────────────────────────────────────────────

export const PageChat = ({ isMobile = false }: { isMobile?: boolean }) => {
  const router = useRouter()
  const pathname = usePathname()

  // /chats/<channelId> → channelId, /chats → null
  const urlChannelId = React.useMemo(() => {
    const segments = pathname.split('/')
    return segments[1] === 'chats' && segments[2] ? segments[2] : null
  }, [pathname])

  const { openMember, crossSearchNonce, consumeCrossSearch } = useAppShell()

  const [channelId, setChannelId] = React.useState<string | null>(urlChannelId)
  const [showCreateChannel, setShowCreateChannel] = React.useState(false)
  const [showMemberInvite, setShowMemberInvite] = React.useState(false)
  const [showInfo, setShowInfo] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [globalSearchOpen, setGlobalSearchOpen] = React.useState(false)
  const [bookmarksOpen, setBookmarksOpen] = React.useState(false)
  const [targetMessageId, setTargetMessageId] = React.useState<string | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(true)

  // パーマリンク (/chats/<channelId>?m=<messageId>) で開いたとき、該当メッセージへジャンプする。
  // useSearchParams は Suspense 境界を要求するため、クライアント側で location から読む
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const m = new URLSearchParams(window.location.search).get('m')
    if (m) setTargetMessageId(m)
  }, [pathname])

  // ブラウザの戻る/進むでURLが変わったとき状態を同期
  React.useEffect(() => {
    setChannelId(urlChannelId)
  }, [urlChannelId])

  // 全チャンネル横断ジャンプで設定されたpendingJumpを消費
  React.useEffect(() => {
    if (_pendingJump && _pendingJump.channelId === channelId) {
      setTargetMessageId(_pendingJump.messageId)
      _pendingJump = null
    }
  }, [channelId])

  const { data: projectChannels = [], isFetched: isProjectChannelsFetched } = useProjectChannels()
  const { data: workspaceChannels = [], isFetched: isWorkspaceChannelsFetched } = useWorkspaceChannels()
  const { data: members = [] } = useWorkspaceMembers()
  const { data: dms = [], isFetched: isDmsFetched } = useWorkspaceDms()
  const markChannelRead = useMarkChannelRead()
  const createDmMutation = useCreateDm()

  const fallbackChannelId = React.useMemo(
    () => (projectChannels.find(c => !c.archived) ?? projectChannels[0] ?? null)?.channelId ?? null,
    [projectChannels],
  )

  const availableChannelIds = React.useMemo(
    () => [
      ...projectChannels.map(c => c.channelId),
      ...workspaceChannels.map(c => c.id),
      ...dms.map(d => d.id),
    ],
    [projectChannels, workspaceChannels, dms],
  )
  const hasResolvedInitialChannelLists = isProjectChannelsFetched && isWorkspaceChannelsFetched && isDmsFetched

  React.useEffect(() => {
    if (channelId) setLastVisitedChatChannelId(channelId)
  }, [channelId])

  // PC: /chats を開いた時は前回のチャットを優先し、なければ先頭のプロジェクトチャンネルへ遷移
  React.useEffect(() => {
    if (!channelId && !isMobile) {
      const nextChannelId = resolveInitialChatChannelId({
        rememberedChannelId: getLastVisitedChatChannelId(),
        availableChannelIds,
        fallbackChannelId,
        allowFallback: hasResolvedInitialChannelLists,
      })
      if (nextChannelId) {
        setChannelId(nextChannelId)
        router.replace('/chats/' + nextChannelId)
      }
    }
  }, [availableChannelIds, channelId, fallbackChannelId, hasResolvedInitialChannelLists, isMobile, router])

  const selectChannel = (id: string) => {
    setChannelId(id)
    setSearchOpen(false)
    setGlobalSearchOpen(false)
    setBookmarksOpen(false)
    setTargetMessageId(null)
    router.push('/chats/' + id)
    markChannelRead.mutate(id)
  }

  const jumpToMessage = (messageId: string) => {
    setSearchOpen(false)
    setTargetMessageId(messageId)
  }

  // ⌥N 新規チャンネル / ⌥S 検索 / ⌥D 詳細パネル（PC のみ）
  useCommand('ctx.create', () => setShowCreateChannel(true))
  useCommand('ctx.searchFocus', () => { if (!isMobile) setSearchOpen(true) })
  useCommand('chats.detail', () => { if (!isMobile) setDetailOpen(o => !o) })

  // ⌘⇧F: 横断検索（シェルが chats へ遷移し crossSearchNonce を増やす）。マウント済みでも開く。
  // 開いたら consume してシグナルを 0 に戻し、再マウント時の誤再オープンを防ぐ
  React.useEffect(() => {
    if (crossSearchNonce > 0 && !isMobile) {
      setGlobalSearchOpen(true)
      consumeCrossSearch()
    }
  }, [crossSearchNonce, isMobile, consumeCrossSearch])

  // ⌥↑↓（順送り）: チャンネル一覧（プロジェクト → 全体 → DM の表示順）を前/次へ
  const seekChannel = (dir: 'prev' | 'next') => {
    const orderedIds = [
      ...projectChannels.map(c => c.channelId),
      ...workspaceChannels.map(c => c.id),
      ...dms.map(d => d.id),
    ]
    if (orderedIds.length === 0) return
    const idx = channelId ? orderedIds.indexOf(channelId) : -1
    const nextIdx = idx === -1
      ? (dir === 'next' ? 0 : orderedIds.length - 1)
      : Math.min(Math.max(idx + (dir === 'next' ? 1 : -1), 0), orderedIds.length - 1)
    const nextId = orderedIds[nextIdx]
    if (nextId && nextId !== channelId) selectChannel(nextId)
  }
  useCommand('seq.prev', () => seekChannel('prev'))
  useCommand('seq.next', () => seekChannel('next'))

  const jumpToChannelMessage = (chanId: string, messageId: string) => {
    setGlobalSearchOpen(false)
    setBookmarksOpen(false)
    // 既に開いているチャンネルへのジャンプは channelId が変化しないため、
    // _pendingJump 消費用 effect（[channelId] 依存）が発火しない。その場合は直接 targetMessageId を設定する
    if (chanId === channelId) {
      setTargetMessageId(messageId)
    } else {
      _pendingJump = { channelId: chanId, messageId }
      setChannelId(chanId)
    }
    router.push('/chats/' + chanId)
    markChannelRead.mutate(chanId)
  }

  const handleStartDm = (targetUserId: string) => {
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
  // 非公開チャンネルのみ「チャンネル参加者」を表示するためメンバーを取得する
  const { data: channelMemberIds = [] } = useChannelMembers(isPrivate ? channelId : null)

  // 紐づくプロジェクトの概要（説明・ステータス・タスク進捗・メンバー）をインフォメーション欄に出す
  const { data: projects = [] } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => fetchWithAuth('/api/projects').then(r => {
      if (!r.ok) throw new Error('fetch failed')
      return r.json()
    }),
    enabled: isProject,
  })
  const linkedProject = isProject && currentChannel
    ? (projects.find(p => p.id === currentChannel.projectId) ?? null)
    : null

  // プロジェクト連動メンバー（ProjectDto.memberNames は最大4名のプレビューのため、
  // 全員＋userId を持つ専用エンドポイントから取得する）
  const { data: projectMembers = [] } = useQuery<ProjectMemberDto[]>({
    queryKey: ['project-members', currentChannel?.projectId],
    queryFn: () => fetchWithAuth(`/api/projects/${currentChannel!.projectId}/members`).then(r => {
      if (!r.ok) throw new Error('fetch failed')
      return r.json()
    }),
    enabled: isProject && !!currentChannel,
  })

  const channelMembers = React.useMemo<ChatDetailMember[]>(() => {
    if (isDm) {
      return [
        { userId: currentDm.participantId, name: currentDm.participantName, url: currentDm.participantAvatarUrl ?? null },
        ...(currentUser ? [{ userId: currentUser.id, name: currentUser.displayName, url: currentUser.avatarUrl ?? null }] : []),
      ]
    }
    if (isProject) {
      // プロジェクト連動: 紐づくプロジェクトの全メンバーを表示
      return projectMembers.map(m => ({ userId: m.userId, name: m.displayName, url: m.avatarUrl ?? null }))
    }
    if (isPrivate) {
      const idSet = new Set(channelMemberIds.map(m => m.userId))
      return members.filter(m => idSet.has(m.userId)).map(m => ({ userId: m.userId, name: m.displayName, url: m.avatarUrl ?? null }))
    }
    // 公開（全体）チャンネルはヘッダーのアバター表示用に名前だけ保持（パネルでは非表示）
    const names = currentGeneral?.memberNames ?? []
    const urls = currentGeneral?.memberAvatarUrls ?? []
    return names.map((name, i) => ({ name, url: urls[i] ?? null }))
  }, [isDm, isProject, isPrivate, currentDm, currentUser, channelMemberIds, members, currentGeneral, projectMembers])

  // メンバー欄の見出し。意味がチャンネル種別で変わるため明示。公開チャンネルは非表示(null)
  const memberLabel = isProject ? 'プロジェクトメンバー' : isPrivate ? 'チャンネル参加者' : isDm ? '参加者' : null

  const handleOpenProject = () => {
    if (currentChannel) {
      setShowInfo(false)
      // チャット上にパネルを重ねず、プロジェクトページを開いた状態へ遷移する
      router.push(`/projects?open=project-${currentChannel.projectId}`)
    }
  }
  const handleOpenMember = (userId: string) => {
    setShowInfo(false)
    openMember(userId)
  }

  const memberNames = channelMembers.map(m => m.name)
  const memberAvatarUrls = channelMembers.map(m => m.url)

  const channelListNode = (
    <ChannelList
      channelId={channelId}
      onSelectChannel={selectChannel}
      projectChannels={projectChannels}
      workspaceChannels={workspaceChannels}
      dms={dms}
      members={members}
      isMobile={isMobile}
      onAddChannel={() => setShowCreateChannel(true)}
      onStartDm={handleStartDm}
    />
  )

  const createChannelUI = showCreateChannel && (
    isMobile
      ? <CreateChannelSheet onClose={() => setShowCreateChannel(false)} onCreated={(channel) => selectChannel(channel.id)}/>
      : <CreateChannelModal onClose={() => setShowCreateChannel(false)} onCreated={(channel) => selectChannel(channel.id)}/>
  )

  // ─── モバイル ─────────────────────────────────────────────────
  if (isMobile) {
    // URLにchannelIdがなければチャンネル一覧、あればスレッド
    if (!channelId) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
          <MobileHeader
            title="チャット"
            right={
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn" onClick={() => { setBookmarksOpen(b => !b); setGlobalSearchOpen(false) }} style={{ background: bookmarksOpen ? 'var(--card-hover)' : undefined }}>
                  <Icon name="bookmark" size={16}/>
                </button>
                <button className="btn" onClick={() => { setGlobalSearchOpen(s => !s); setBookmarksOpen(false) }} style={{ background: globalSearchOpen ? 'var(--card-hover)' : undefined }}>
                  <Icon name="search" size={16}/>
                </button>
              </div>
            }
          />
          {bookmarksOpen
            ? <BookmarksPanel onClose={() => setBookmarksOpen(false)} onJump={jumpToChannelMessage} isMobile/>
            : globalSearchOpen
              ? <CrossChannelSearch onClose={() => setGlobalSearchOpen(false)} onJump={jumpToChannelMessage} isMobile/>
              : channelListNode
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
          onBack={() => router.push('/chats')}
          right={
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn" onClick={() => setSearchOpen(s => !s)} style={{ background: searchOpen ? 'var(--card-hover)' : undefined }}><Icon name="search" size={16}/></button>
              {isPrivate && (
                <button className="btn" onClick={() => setShowMemberInvite(true)}>
                  <Icon name="userPlus" size={16}/>
                </button>
              )}
              <button className="btn" onClick={() => setShowInfo(true)} aria-label="チャンネル情報">
                <Icon name="info" size={18}/>
              </button>
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
        {showInfo && (
          <ChatInfoDrawer
            onClose={() => setShowInfo(false)}
            isProject={isProject}
            isDm={isDm}
            isPrivate={isPrivate}
            channelName={channelName}
            currentDmAvatarUrl={currentDm?.participantAvatarUrl}
            dmParticipantId={currentDm?.participantId ?? null}
            project={linkedProject}
            channelMembers={channelMembers}
            memberLabel={memberLabel}
            channelId={channelId}
            /* 招待シートはチャット直下で一元描画するため、ドロワー内では描画しない */
            showMemberInvite={false}
            onInviteMember={() => setShowMemberInvite(true)}
            onCloseMemberInvite={() => setShowMemberInvite(false)}
            onOpenProject={handleOpenProject}
            onOpenMember={handleOpenMember}
          />
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
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="btn"
              onClick={() => { setBookmarksOpen(b => !b); setGlobalSearchOpen(false) }}
              style={{ background: bookmarksOpen ? 'var(--card-hover)' : undefined }}
              title="ブックマーク"
            >
              <Icon name="bookmark" size={13}/>
            </button>
            <button
              className="btn"
              onClick={() => { setGlobalSearchOpen(s => !s); setBookmarksOpen(false) }}
              style={{ background: globalSearchOpen ? 'var(--card-hover)' : undefined }}
              title="全チャンネル検索"
            >
              <Icon name="search" size={13}/>
            </button>
          </div>
        </div>
        {channelListNode}
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {!globalSearchOpen && !bookmarksOpen && (
          <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
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
              <BellButton/>
            </div>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
            {bookmarksOpen
              ? <BookmarksPanel onClose={() => setBookmarksOpen(false)} onJump={jumpToChannelMessage}/>
              : globalSearchOpen
                ? <CrossChannelSearch onClose={() => setGlobalSearchOpen(false)} onJump={jumpToChannelMessage}/>
                : searchOpen && channelId
                  ? <ChatMessageSearch channelId={channelId} onClose={() => setSearchOpen(false)} onJump={jumpToMessage} isMobile={isMobile}/>
                  : <ChatThread channelId={channelId} channelName={channelName} isPrivate={isPrivate} isMobile={isMobile} targetMessageId={targetMessageId}/>
            }
          </main>

          {detailOpen && <ChatDetailSidebar
            isProject={isProject}
            isDm={isDm}
            isPrivate={isPrivate}
            channelName={channelName}
            currentDmAvatarUrl={currentDm?.participantAvatarUrl}
            dmParticipantId={currentDm?.participantId ?? null}
            project={linkedProject}
            channelMembers={channelMembers}
            memberLabel={memberLabel}
            channelId={channelId}
            showMemberInvite={showMemberInvite}
            onInviteMember={() => setShowMemberInvite(true)}
            onCloseMemberInvite={() => setShowMemberInvite(false)}
            onOpenProject={handleOpenProject}
            onOpenMember={handleOpenMember}
          />}
        </div>
      </div>
    </div>
  )
}
