// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import ChatsLayout from './layout'
import ChatsPage from './page'
import ChannelPage from './[channelId]/page'

const { router, navigation, threadMount, threadUnmount, empty, channels, bookmarks } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  navigation: { pathname: '/chats/a' },
  threadMount: vi.fn(),
  threadUnmount: vi.fn(),
  empty: [],
  channels: ['a', 'b', 'c'].map(id => ({
    id, name: `会話${id.toUpperCase()}`, parentChannelId: null, isPrivate: false, archived: id === 'c',
    memberCount: 0, memberNames: [], memberAvatarUrls: [], unreadCount: 0, unreadMentionCount: 0,
  })),
  bookmarks: [{
    id: 'message-b', channelId: 'b', channelName: '会話B', senderName: '送信者',
    content: '移動先メッセージ', createdAt: '2026-10-14T10:00:00Z',
  }],
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => router,
}))
vi.mock('@/lib/chat/client', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/chat/client')>(),
  useProjectChannels: () => ({ data: empty, isFetched: true, isSuccess: true, isFetching: false }),
  useWorkspaceChannels: () => ({ data: channels, isFetched: true, isSuccess: true, isFetching: false }),
  useWorkspaceDms: () => ({ data: empty, isFetched: true, isSuccess: true, isFetching: false }),
  useWorkspaceMembers: () => ({ data: empty }),
  useChannelMembers: () => ({ data: empty }),
  useBookmarks: () => ({ data: bookmarks, isFetching: false }),
  useCreateDm: () => ({ mutate: vi.fn() }),
  useDeleteWorkspaceChannel: () => ({ mutateAsync: vi.fn() }),
  useSetWorkspaceChannelArchived: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { id: 'user-1', displayName: '利用者', wsRole: 'owner' } }),
  useWorkspacePermissions: () => ({ isAdmin: true }),
}))
vi.mock('@/hooks/use-project-milestones', () => ({
  usePatchProjectMilestone: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/components/app/sidebar', () => ({ BellButton: () => null }))
vi.mock('@/components/app/pages/chat-detail-sidebar', () => ({
  ChatDetailSidebar: ({ channelId }: { channelId: string }) => <div data-testid="detail">{channelId}</div>,
  ChatInfoDrawer: () => null,
}))
vi.mock('@/components/app/chat-thread', () => ({
  ChatThread: ({ channelId, targetMessage }: { channelId: string; targetMessage: { id: string } | null }) => {
    React.useEffect(() => {
      threadMount(channelId)
      return () => threadUnmount(channelId)
    }, [channelId])
    return <div data-testid="thread" data-channel={channelId} data-message={targetMessage?.id} />
  },
}))

function renderChats(pathname = '/chats/a') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = () => (
    <QueryClientProvider client={queryClient}>
      <ChatsLayout>{navigation.pathname === '/chats' ? <ChatsPage key="index" /> : <ChannelPage key={navigation.pathname} />}</ChatsLayout>
    </QueryClientProvider>
  )
  navigation.pathname = pathname.split('?')[0]!
  window.history.replaceState(null, '', pathname)
  const rendered = render(view())
  return {
    navigate: (next: string) => {
      navigation.pathname = next.split('?')[0]!
      window.history.replaceState(null, '', next)
      rendered.rerender(view())
    },
  }
}

describe('共有チャットlayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem(STORAGE_KEYS.chat_sidebar_width, '360')
  })
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('会話の選択・戻る・進むでサイドバーのDOM・幅・スクロール・開閉状態を保ち、本文だけを切り替える', () => {
    const { navigate } = renderChats()
    const sidebar = screen.getByRole('complementary')
    const list = sidebar.querySelector<HTMLElement>('[style*="overflow: auto"]')!
    const firstThread = screen.getByTestId('thread')
    fireEvent.click(within(sidebar).getByRole('button', { name: /アーカイブ済みチャンネル/ }))
    const archivedChannel = within(sidebar).getByText('会話C')
    list.scrollTop = 120
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    expect(sidebar).toHaveStyle({ width: '376px' })

    fireEvent.click(within(sidebar).getByText('会話B'))
    expect(router.push).toHaveBeenCalledWith('/chats/b')
    navigate('/chats/b')
    expect(screen.getByTestId('thread')).toHaveAttribute('data-channel', 'b')
    expect(screen.getByTestId('thread')).not.toBe(firstThread)
    expect(screen.getByTestId('detail')).toHaveTextContent('b')

    navigate('/chats/a')
    expect(screen.getByTestId('thread')).toHaveAttribute('data-channel', 'a')
    navigate('/chats/b')
    expect(screen.getByTestId('thread')).toHaveAttribute('data-channel', 'b')
    expect(screen.getByRole('complementary')).toBe(sidebar)
    expect(sidebar).toHaveStyle({ width: '376px' })
    expect(list.scrollTop).toBe(120)
    expect(within(sidebar).getByText('会話C')).toBe(archivedChannel)
    expect(threadMount.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'a', 'b'])
    expect(threadUnmount.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'a'])
  })

  it('/chatsから前回の会話へ遷移するときもサイドバーを保持する', () => {
    localStorage.setItem(STORAGE_KEYS.chat_last_channel_id, 'b')
    const { navigate } = renderChats('/chats')
    const sidebar = screen.getByRole('complementary')
    expect(router.replace).toHaveBeenCalledWith('/chats/b')
    navigate('/chats/b')
    expect(screen.getByRole('complementary')).toBe(sidebar)
    expect(screen.getByTestId('thread')).toHaveAttribute('data-channel', 'b')
  })

  it('ブックマークから別会話へ移動してもURL確定後にジャンプ先を維持する', () => {
    const { navigate } = renderChats()
    fireEvent.click(screen.getByTitle('ブックマーク'))
    fireEvent.click(screen.getByText('移動先メッセージ'))
    expect(router.push).toHaveBeenCalledWith('/chats/b')
    expect(screen.getByTestId('thread')).toHaveAttribute('data-message', 'message-b')
    navigate('/chats/b')
    expect(screen.getByTestId('thread')).toHaveAttribute('data-channel', 'b')
    expect(screen.getByTestId('thread')).toHaveAttribute('data-message', 'message-b')
    navigate('/chats/a')
    expect(screen.getByTestId('thread')).not.toHaveAttribute('data-message')
  })

  it('URLで開いた会話内検索を履歴移動先に持ち越さず、パーマリンクは反映する', () => {
    const { navigate } = renderChats('/chats/a?panel=search')
    expect(screen.getByPlaceholderText('メッセージを検索…')).toBeInTheDocument()
    navigate('/chats/b?m=message-b')
    expect(screen.queryByPlaceholderText('メッセージを検索…')).toBeNull()
    expect(screen.getByTestId('thread')).toHaveAttribute('data-channel', 'b')
    expect(screen.getByTestId('thread')).toHaveAttribute('data-message', 'message-b')
  })

  it('ジャンプの移動途中で会話を選び直した場合は古いジャンプ先を破棄する', () => {
    const { navigate } = renderChats()
    const sidebar = screen.getByRole('complementary')
    fireEvent.click(screen.getByTitle('ブックマーク'))
    fireEvent.click(screen.getByText('移動先メッセージ'))
    fireEvent.click(within(sidebar).getByText('会話A'))
    navigate('/chats/a')
    fireEvent.click(within(sidebar).getByText('会話B'))
    navigate('/chats/b')
    expect(screen.getByTestId('thread')).toHaveAttribute('data-channel', 'b')
    expect(screen.getByTestId('thread')).not.toHaveAttribute('data-message')
  })
})
