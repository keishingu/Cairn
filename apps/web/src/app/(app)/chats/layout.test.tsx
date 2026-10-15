// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectChannelDto } from '@/app/api/projects/channels/route'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import ChatsLayout from './layout'
import ChatsPage from './page'
import ChannelPage from './[channelId]/page'

const { router, navigation, threadMount, threadUnmount, threadJump, empty, channels, projectChannels, bookmarks } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  navigation: { pathname: '/chats/a', search: '' },
  threadMount: vi.fn(),
  threadUnmount: vi.fn(),
  threadJump: vi.fn(),
  empty: [],
  projectChannels: [] as ProjectChannelDto[],
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
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => router,
}))
vi.mock('@/lib/chat/client', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/chat/client')>(),
  useProjectChannels: () => ({ data: projectChannels, isFetched: true, isSuccess: true, isFetching: false }),
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
vi.mock('@/components/app/pages/create-project-modal', () => ({
  CreateProjectModal: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>プロジェクト作成を閉じる</button>,
}))
vi.mock('@/components/app/pages/create-milestone-modal', () => ({
  CreateMilestoneModal: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>マイルストーン作成を閉じる</button>,
  EditMilestoneModal: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>マイルストーン編集を閉じる</button>,
}))
vi.mock('@/components/app/pages/chat-detail-sidebar', () => ({
  ChatDetailSidebar: ({ channelId, onJumpToMessage }: { channelId: string; onJumpToMessage: (id: string) => void }) => (
    <div data-testid="detail">{channelId}<button onClick={() => onJumpToMessage('detail-message')}>詳細からメッセージへ移動</button></div>
  ),
  ChatInfoDrawer: () => null,
}))
vi.mock('@/components/app/chat-thread', () => ({
  ChatThread: ({ channelId, targetMessage }: { channelId: string; targetMessage: { id: string } | null }) => {
    React.useEffect(() => {
      threadMount(channelId)
      return () => threadUnmount(channelId)
    }, [channelId])
    React.useEffect(() => {
      if (targetMessage) threadJump(targetMessage)
    }, [targetMessage])
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
  navigation.search = pathname.split('?')[1] ?? ''
  window.history.replaceState(null, '', pathname)
  const rendered = render(view())
  return {
    navigate: (next: string) => {
      navigation.pathname = next.split('?')[0]!
      navigation.search = next.split('?')[1] ?? ''
      window.history.replaceState(null, '', next)
      rendered.rerender(view())
    },
  }
}

describe('共有チャットlayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectChannels.length = 0
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
    expect(router.push).toHaveBeenCalledWith('/chats/b?m=message-b')
    expect(screen.getByTestId('thread')).toHaveAttribute('data-message', 'message-b')
    navigate('/chats/b?m=message-b')
    expect(screen.getByTestId('thread')).toHaveAttribute('data-channel', 'b')
    expect(screen.getByTestId('thread')).toHaveAttribute('data-message', 'message-b')
    navigate('/chats/a')
    expect(screen.getByTestId('thread')).not.toHaveAttribute('data-message')
  })

  it('同じ会話のクエリだけの移動でも、検索とメッセージのパーマリンクを履歴に合わせて切り替える', () => {
    const { navigate } = renderChats()
    const sidebar = screen.getByRole('complementary')
    navigate('/chats/a?m=message-1')
    expect(screen.getByTestId('thread')).toHaveAttribute('data-message', 'message-1')
    const jumps = threadJump.mock.calls.length
    navigate('/chats/a?m=message-1&open=member-u&tab=files')
    expect(threadJump).toHaveBeenCalledTimes(jumps)
    navigate('/chats/a?panel=search')
    expect(screen.getByPlaceholderText('メッセージを検索…')).toBeInTheDocument()
    navigate('/chats/a?m=message-2')
    expect(screen.queryByPlaceholderText('メッセージを検索…')).toBeNull()
    expect(screen.getByTestId('thread')).toHaveAttribute('data-message', 'message-2')
    navigate('/chats/a?m=message-1')
    expect(screen.getByTestId('thread')).toHaveAttribute('data-message', 'message-1')
    navigate('/chats/a')
    expect(screen.getByTestId('thread')).not.toHaveAttribute('data-message')
    navigate('/chats/a?panel=search&m=old-message&open=project-p')
    fireEvent.click(screen.getByText('詳細からメッセージへ移動'))
    expect(router.replace).toHaveBeenLastCalledWith('/chats/a?m=detail-message&open=project-p', { scroll: false })
    const detailJumps = threadJump.mock.calls.length
    navigate('/chats/a?m=detail-message&open=project-p')
    expect(threadJump).toHaveBeenCalledTimes(detailJumps)
    fireEvent.click(screen.getByText('詳細からメッセージへ移動'))
    expect(threadJump).toHaveBeenCalledTimes(detailJumps + 1)
    expect(screen.getByTestId('thread')).toHaveAttribute('data-message', 'detail-message')
    expect(screen.getByRole('complementary')).toBe(sidebar)
  })

  it('横断検索のURLを前回の会話への自動遷移でも保持する', () => {
    localStorage.setItem(STORAGE_KEYS.chat_last_channel_id, 'b')
    const { navigate } = renderChats('/chats?panel=global-search')
    const sidebar = screen.getByRole('complementary')
    expect(router.replace).toHaveBeenCalledWith('/chats/b?panel=global-search')
    navigate('/chats/b?panel=global-search')
    expect(screen.getByPlaceholderText('全チャンネルを横断検索…')).toBeInTheDocument()
    navigate('/chats/b?panel=global-search&m=message-1')
    fireEvent.click(screen.getByTitle('ブックマーク'))
    expect(router.replace).toHaveBeenLastCalledWith('/chats/b?panel=bookmarks&m=message-1', { scroll: false })
    navigate('/chats/b?panel=bookmarks&m=message-1')
    expect(screen.getByText('移動先メッセージ')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('全チャンネルを横断検索…')).toBeNull()
    expect(screen.getByRole('complementary')).toBe(sidebar)
  })

  it('一覧から開いた表示はメンバーパネルやタブのクエリ変更でも維持し、会話移動では閉じる', () => {
    const { navigate } = renderChats()
    fireEvent.click(screen.getByTitle('全チャンネル検索'))
    navigate('/chats/a?open=member-u')
    expect(screen.getByPlaceholderText('全チャンネルを横断検索…')).toBeInTheDocument()
    navigate('/chats/a?open=member-u&tab=files')
    expect(screen.getByPlaceholderText('全チャンネルを横断検索…')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('ブックマーク'))
    navigate('/chats/a?open=member-v')
    expect(screen.getByText('移動先メッセージ')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'プロジェクトを追加' }))
    navigate('/chats/a?open=member-v&tab=files')
    expect(screen.getByText('プロジェクト作成を閉じる')).toBeInTheDocument()
    navigate('/chats/b')
    expect(screen.queryByText('プロジェクト作成を閉じる')).toBeNull()
    expect(screen.queryByText('移動先メッセージ')).toBeNull()
  })

  it('URLを離れたモーダルと未取得の編集要求を残さず、閉じると他のクエリを保つ', () => {
    const { navigate } = renderChats('/chats/a?panel=create-project&m=message-1')
    navigate('/chats/b')
    expect(screen.queryByText('プロジェクト作成を閉じる')).toBeNull()
    navigate('/chats/a?panel=create-project&m=message-1')
    fireEvent.click(screen.getByText('プロジェクト作成を閉じる'))
    expect(router.replace).toHaveBeenLastCalledWith('/chats/a?m=message-1', { scroll: false })
    navigate('/chats/a?panel=create-milestone&projectId=p&projectTitle=P')
    expect(screen.queryByText('プロジェクト作成を閉じる')).toBeNull()
    expect(screen.getByText('マイルストーン作成を閉じる')).toBeInTheDocument()
    navigate('/chats/a?panel=edit-milestone&milestoneId=m')
    expect(screen.queryByText('マイルストーン作成を閉じる')).toBeNull()
    expect(screen.queryByText('マイルストーン編集を閉じる')).toBeNull()
    navigate('/chats/b')
    projectChannels.push({
      channelId: 'milestone-channel', channelName: 'M', projectId: 'p', projectTitle: 'P',
      startDate: null, endDate: null, startTime: null, endTime: null, archived: false,
      unreadCount: 0, unreadMentionCount: 0, milestoneId: 'm', milestoneCompleted: false,
    })
    navigate('/chats/b')
    expect(screen.queryByText('マイルストーン編集を閉じる')).toBeNull()
    navigate('/chats/a?panel=edit-milestone&milestoneId=m')
    expect(screen.getByText('マイルストーン編集を閉じる')).toBeInTheDocument()
    fireEvent.click(screen.getByText('マイルストーン編集を閉じる'))
    expect(router.replace).toHaveBeenLastCalledWith('/chats/a?milestoneId=m', { scroll: false })
    navigate('/chats/a?milestoneId=m')
    expect(screen.queryByText('マイルストーン編集を閉じる')).toBeNull()
    navigate('/chats/a?panel=edit-milestone&milestoneId=m')
    navigate('/chats/a')
    expect(screen.queryByText('マイルストーン編集を閉じる')).toBeNull()
    navigate('/chats/a?panel=bookmarks')
    fireEvent.click(screen.getByRole('button', { name: 'プロジェクトを追加' }))
    router.replace.mockClear()
    fireEvent.click(screen.getByText('プロジェクト作成を閉じる'))
    expect(router.replace).not.toHaveBeenCalled()
    expect(screen.getByText('移動先メッセージ')).toBeInTheDocument()
  })

  it.each(['閉じるボタン', '一覧の切り替えボタン'])('横断検索を%sで閉じるとURLからpanelだけを除き、別のクエリ更新でも再表示しない', method => {
    const { navigate } = renderChats('/chats/a?panel=global-search&m=message-1&open=project-p')
    if (method === '閉じるボタン') {
      fireEvent.keyDown(screen.getByPlaceholderText('全チャンネルを横断検索…'), { key: 'Escape' })
    } else {
      fireEvent.click(screen.getByTitle('全チャンネル検索'))
    }
    expect(router.replace).toHaveBeenLastCalledWith('/chats/a?m=message-1&open=project-p', { scroll: false })
    navigate('/chats/a?m=message-1&open=project-p')
    navigate('/chats/a?m=message-1&open=project-q')
    expect(screen.queryByPlaceholderText('全チャンネルを横断検索…')).toBeNull()
  })
})
