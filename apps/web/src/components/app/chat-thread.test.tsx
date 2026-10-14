// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { cloneElement } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translate } from '@cairn/shared'
import {
  ChatMessage,
  ChatThread,
  copyMessageContent,
  copyMessageLink,
  isNearMessageTimelineEnd,
  makeTaskFromMessage,
} from './chat-thread'

const copyT = (message: string, values?: Record<string, string | number>) => translate('ja', message, values)

// Node 24 does not expose storage under this jsdom config, so provide the browser storage API used here.
const chatTestStorage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => chatTestStorage.get(key) ?? null,
  setItem: (key: string, value: string) => chatTestStorage.set(key, String(value)),
  removeItem: (key: string) => chatTestStorage.delete(key),
  clear: () => chatTestStorage.clear(),
})

const { fetchWithAuthMock, toastSuccess, toastError, markChannelRead, bookmarkMessage, sendMessage, chatThreadState } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  markChannelRead: vi.fn(),
  bookmarkMessage: vi.fn(),
  sendMessage: vi.fn(),
  chatThreadState: {
    initialMessageId: null as string | null,
    historyMessages: undefined as Array<Record<string, unknown>> | undefined,
    historyIsError: false,
    workspaceMembers: [] as Array<{ userId: string; displayName: string; role: 'member' | 'guest' }>,
    projectChannels: [] as Array<{ channelId: string; projectId: string }>,
    projectChannelsResolved: true,
    projectChannelsError: null as Error | null,
    refetchProjectChannels: vi.fn(),
    sendError: null as Error | null,
    projectMembers: [] as Array<{ userId: string }>,
    profileAttributes: [] as Array<{ id: string; name: string; color: string }>,
  },
}))

let clipboardWriteText: ReturnType<typeof vi.fn>

vi.mock('@/lib/chat/client', () => ({
  ChannelMessagesError: class ChannelMessagesError extends Error {},
  formatChatMessageTime: () => '12:34',
  useChannelInitialMessage: () => ({ data: { messageId: chatThreadState.initialMessageId }, isFetched: true, isFetching: false, isError: false }),
  useChannelMessageHistory: () => ({ data: chatThreadState.historyMessages, isFetched: true, isLoading: false, isError: chatThreadState.historyIsError }),
  useChannelMembers: () => ({ data: [] }),
  useChannelMessages: () => ({
    data: [{
      id: 'message-1', content: 'hello', messageType: 'text', senderId: 'user-2', senderName: 'Alice', senderAvatarUrl: null,
      createdAt: '2026-08-23T12:00:00.000Z', isEdited: false, reactions: [], attachments: [], parentMessageId: null,
      replyTo: null, bookmarked: false, blocked: false,
    }],
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
  }),
  useDeleteMessage: () => ({ mutate: vi.fn() }),
  useEditMessage: () => ({ mutate: vi.fn() }),
  useEnsureMessageLoaded: () => vi.fn(),
  useLoadOlderChannelMessages: () => ({ loadOlder: vi.fn(), hasMore: false, isLoadingOlder: false, error: null }),
  useMarkChannelRead: () => ({ mutate: markChannelRead }),
  useProjectChannels: () => ({
    data: chatThreadState.projectChannels,
    isSuccess: chatThreadState.projectChannelsResolved,
    error: chatThreadState.projectChannelsError,
    refetch: chatThreadState.refetchProjectChannels,
  }),
  useSendChannelMessage: () => ({ mutate: sendMessage, isError: !!chatThreadState.sendError, isSuccess: false, isPending: false, error: chatThreadState.sendError }),
  useToggleBookmark: () => ({ mutate: bookmarkMessage }),
  useToggleMessageReaction: () => ({ mutate: vi.fn() }),
  useWorkspaceMembers: () => ({ data: chatThreadState.workspaceMembers }),
}))

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { id: 'user-1', displayName: 'Kei', avatarUrl: null } }),
}))

vi.mock('@/hooks/use-ai-nudges', () => ({
  aiNudgeQueryKey: () => ['ai-nudges'],
  useAiNudgeFeedback: () => ({ mutate: vi.fn(), isPending: false }),
  useAiNudges: () => ({ data: [], isError: false }),
}))
vi.mock('@/hooks/use-project-members', () => ({ useProjectMembers: () => ({ data: chatThreadState.projectMembers }) }))
vi.mock('@/hooks/use-profile-attributes', () => ({
  useProfileAttributes: () => ({ data: chatThreadState.profileAttributes }),
}))
vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth: fetchWithAuthMock }))
vi.mock('@/lib/command-registry', () => ({ useCommand: vi.fn() }))

vi.mock('@/lib/toast', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}))

describe('ChatMessage copy action', () => {
  beforeEach(() => {
    toastSuccess.mockReset()
    toastError.mockReset()
    clipboardWriteText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: clipboardWriteText,
      },
    })
  })

  it('他人のメッセージでもコピー項目だけを表示する', async () => {
    const user = userEvent.setup()
    const content = 'https://example.com/very/long/path?token=abcdef1234567890&next=%2Fprojects%2Falpha'

    render(
      <ChatMessage
        messageId="message-1"
        messageType="text"
        senderId="user-2"
        currentUserId="user-1"
        senderName="Alice"
        createdAt="2026-06-25T12:00:00.000Z"
        isEdited={false}
        content={content}
        reactions={[]}
        attachments={[]}
        replyTo={null}
        bookmarked={false}
        onReact={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCheckboxToggle={vi.fn()}
        onReply={vi.fn()}
        onBookmark={vi.fn()}
        onMakeTask={vi.fn()}
        onJumpToMessage={vi.fn()}
        onCopyLink={vi.fn()}
        onImageClick={vi.fn()}
        isMobile
      />,
    )

    const reply = screen.getByTitle('返信')
    const sender = screen.getByText('Alice')
    const header = sender.parentElement?.parentElement
    expect(reply.parentElement?.parentElement).toBe(header)
    expect(header?.contains(screen.getByRole('link'))).toBe(false)

    await user.click(screen.getByTitle('操作'))

    expect(screen.getByRole('button', { name: 'コピー' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '編集' })).toBeNull()
    expect(screen.queryByRole('button', { name: '削除' })).toBeNull()
  })

  it.each([
    ['他人のメッセージ', 'user-2'],
    ['自分のメッセージ', 'user-1'],
  ])('%sでも「…」メニューに「タスク化する」を出し、選ぶと親のコールバックを呼ぶ', async (_label, senderId) => {
    const user = userEvent.setup()
    const onMakeTask = vi.fn()

    render(
      <ChatMessage
        messageId="message-1"
        messageType="text"
        senderId={senderId}
        currentUserId="user-1"
        senderName="Alice"
        createdAt="2026-06-25T12:00:00.000Z"
        isEdited={false}
        content="資料を確認する"
        reactions={[]}
        attachments={[]}
        replyTo={null}
        bookmarked={false}
        onReact={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCheckboxToggle={vi.fn()}
        onReply={vi.fn()}
        onBookmark={vi.fn()}
        onMakeTask={onMakeTask}
        onJumpToMessage={vi.fn()}
        onCopyLink={vi.fn()}
        onImageClick={vi.fn()}
        isMobile
      />,
    )

    await user.click(screen.getByTitle('操作'))
    await user.click(screen.getByRole('button', { name: 'タスク化する' }))

    expect(onMakeTask).toHaveBeenCalledWith('message-1')
  })

  it('システムメッセージには「タスク化する」を出さない', () => {
    render(
      <ChatMessage
        messageId="message-sys"
        messageType="system"
        senderId="user-2"
        currentUserId="user-1"
        senderName="System"
        createdAt="2026-06-25T12:00:00.000Z"
        isEdited={false}
        content="ステータスを変更しました"
        reactions={[]}
        attachments={[]}
        replyTo={null}
        bookmarked={false}
        onReact={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCheckboxToggle={vi.fn()}
        onReply={vi.fn()}
        onBookmark={vi.fn()}
        onMakeTask={vi.fn()}
        onJumpToMessage={vi.fn()}
        onCopyLink={vi.fn()}
        onImageClick={vi.fn()}
      />,
    )

    expect(screen.queryByTitle('操作')).toBeNull()
  })

  it('タスクを作成したら「タスクに追加しました」と開くリンクのトーストを出す', async () => {
    fetchWithAuthMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'task-1', created: true }) })

    await expect(makeTaskFromMessage('message-1', copyT)).resolves.toBe(true)

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/messages/message-1/task', { method: 'POST' })
    expect(toastSuccess).toHaveBeenCalledWith('タスクに追加しました', {
      action: { label: '開く', href: '/tasks?taskId=task-1' },
    })
  })

  it('既にタスク化済みなら「このメッセージは既にタスクです」と開くリンクのトーストを出す', async () => {
    fetchWithAuthMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'task-1', created: false }) })

    await expect(makeTaskFromMessage('message-1', copyT)).resolves.toBe(true)

    expect(toastSuccess).toHaveBeenCalledWith('このメッセージは既にタスクです', {
      action: { label: '開く', href: '/tasks?taskId=task-1' },
    })
  })

  it('APIが失敗したらそのエラー文言をエラートーストに出す', async () => {
    fetchWithAuthMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: '本文のないメッセージはタスクにできません' }),
    })

    await expect(makeTaskFromMessage('message-1', copyT)).resolves.toBe(false)

    expect(toastError).toHaveBeenCalledWith('本文のないメッセージはタスクにできません')
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('通信に失敗したら汎用のエラートーストを出す', async () => {
    fetchWithAuthMock.mockRejectedValue(new Error('network'))

    await expect(makeTaskFromMessage('message-1', copyT)).resolves.toBe(false)

    expect(toastError).toHaveBeenCalledWith('このメッセージをタスクにできませんでした')
  })

  it('元の本文をそのままコピーして成功トーストを出す', async () => {
    const content = 'https://example.com/very/long/path?token=abcdef1234567890&next=%2Fprojects%2Falpha'

    await expect(copyMessageContent(content, copyT)).resolves.toBe(true)

    expect(clipboardWriteText).toHaveBeenCalledWith(content)
    expect(toastSuccess).toHaveBeenCalledWith('メッセージをコピーしました')
  })

  it('コピーに失敗したらエラートーストを出す', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    await expect(copyMessageContent('hello', copyT)).resolves.toBe(false)

    expect(writeText).toHaveBeenCalledWith('hello')
    expect(toastError).toHaveBeenCalledWith('メッセージをコピーできませんでした')
  })

  it('メッセージのリンクをコピーして成功トーストを出す', async () => {
    const url = 'https://develop.oss-cairn.com/chats/channel-1?m=message-1'

    await expect(copyMessageLink(url, copyT)).resolves.toBe(true)

    expect(clipboardWriteText).toHaveBeenCalledWith(url)
    expect(toastSuccess).toHaveBeenCalledWith('リンクをコピーしました')
  })

  it('メッセージのリンクをコピーできなければエラートーストを出す', async () => {
    clipboardWriteText.mockRejectedValue(new Error('denied'))

    await expect(copyMessageLink('https://develop.oss-cairn.com/chats/1', copyT)).resolves.toBe(false)

    expect(toastError).toHaveBeenCalledWith('リンクをコピーできませんでした')
  })

  it('Markdown を装飾つきで表示できる', () => {
    render(
      <ChatMessage
        messageId="message-2"
        messageType="text"
        senderId="user-2"
        currentUserId="user-1"
        senderName="Alice"
        createdAt="2026-06-25T12:00:00.000Z"
        isEdited={false}
        content={'**重要**\n- [ ] 持ち物チェック\n[詳細](https://example.com/guide)'}
        reactions={[]}
        attachments={[]}
        replyTo={null}
        bookmarked={false}
        onReact={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCheckboxToggle={vi.fn()}
        onReply={vi.fn()}
        onBookmark={vi.fn()}
        onMakeTask={vi.fn()}
        onJumpToMessage={vi.fn()}
        onCopyLink={vi.fn()}
        onImageClick={vi.fn()}
      />,
    )

    expect(screen.getByText('重要').tagName).toBe('STRONG')
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '詳細' })).toHaveAttribute('href', 'https://example.com/guide')
  })

  it('プロジェクトロールと属性を表示し、通常メンバーロールは省略する', () => {
    const props = {
      messageId: 'message-3',
      messageType: 'text' as const,
      senderId: 'user-2',
      currentUserId: 'user-1',
      senderName: 'Alice',
      createdAt: '2026-06-25T12:00:00.000Z',
      isEdited: false,
      content: 'hello',
      reactions: [],
      attachments: [],
      replyTo: null,
      bookmarked: false,
      onReact: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onCheckboxToggle: vi.fn(),
      onReply: vi.fn(),
      onBookmark: vi.fn(),
      onMakeTask: vi.fn(),
      onJumpToMessage: vi.fn(),
      onCopyLink: vi.fn(),
      onImageClick: vi.fn(),
    }
    const { rerender } = render(
      <ChatMessage
        {...props}
        senderProjectRole="subleader"
        senderProfileAttributes={[
          { id: 'attribute-1', name: '3年生', color: 'blue' },
          { id: 'attribute-2', name: '経済学部', color: 'emerald' },
        ]}
      />,
    )

    expect(screen.getByText('サブリーダー')).toBeInTheDocument()
    expect(screen.getByText('3年生')).toBeInTheDocument()
    expect(screen.getByText('経済学部')).toBeInTheDocument()

    rerender(<ChatMessage {...props} senderProjectRole="member" senderProfileAttributes={[]} />)
    expect(screen.queryByText('メンバー')).toBeNull()

    rerender(
      <ChatMessage
        {...props}
        senderProjectRole="member"
        senderProjectRoleName="デザイナー"
        senderProjectRoleColor="#EC4899"
        senderProjectRoleLegacy={null}
        senderProfileAttributes={[]}
      />,
    )
    expect(screen.getByText('デザイナー')).toBeInTheDocument()

    rerender(
      <ChatMessage
        {...props}
        senderProjectRole="leader"
        senderProjectRoleName="主宰"
        senderProjectRoleLegacy="leader"
        senderProfileAttributes={[]}
      />,
    )
    expect(screen.getByText('主宰')).toBeInTheDocument()
    expect(screen.queryByText('リーダー')).toBeNull()

    rerender(
      <ChatMessage
        {...props}
        senderProjectRole="member"
        senderProjectRoleName="メンバー"
        senderProjectRoleLegacy="member"
        senderProfileAttributes={[]}
      />,
    )
    expect(screen.queryByText('メンバー')).toBeNull()
  })
})

describe('モバイルWebのリアクション表示', () => {
  it('先頭の絵文字に名前がなければ、名前のある絵文字からシートを開く', async () => {
    const user = userEvent.setup()
    render(
      <ChatMessage
        messageId="message-reactions"
        messageType="text"
        senderId="user-2"
        currentUserId="user-1"
        senderName="Alice"
        createdAt="2026-06-25T12:00:00.000Z"
        isEdited={false}
        content="hello"
        reactions={[
          { emoji: '👍', count: 1, mine: false, userNames: [] },
          { emoji: '🎉', count: 1, mine: false, userNames: ['メンバーC'] },
        ]}
        attachments={[]}
        replyTo={null}
        bookmarked={false}
        onReact={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCheckboxToggle={vi.fn()}
        onReply={vi.fn()}
        onBookmark={vi.fn()}
        onMakeTask={vi.fn()}
        onJumpToMessage={vi.fn()}
        onCopyLink={vi.fn()}
        onImageClick={vi.fn()}
        isMobile
      />,
    )

    await user.click(screen.getByRole('button', { name: '操作' }))
    await user.click(screen.getByRole('button', { name: 'リアクションした人を表示' }))
    const dialog = screen.getByRole('dialog', { name: 'リアクションした人を表示' })
    expect(within(dialog).getByRole('button', { name: '🎉 1件のリアクション' })).toHaveAttribute('aria-pressed', 'true')
    expect(dialog).not.toHaveTextContent('このリアクションを付けた人を表示できませんでした')
  })

  it('「…」メニューから絵文字ごとの全員を表示し、リアクション切替は別操作のまま', async () => {
    const user = userEvent.setup()
    const onReact = vi.fn()
    const reactions = [
      { emoji: '👍', count: 2, mine: false, userNames: ['メンバーA', 'メンバーB'] },
      { emoji: '🎉', count: 2, mine: false, userNames: ['メンバーB', 'メンバーC'] },
    ]
    const message = (
      <ChatMessage
        messageId="message-reactions"
        messageType="text"
        senderId="user-2"
        currentUserId="user-1"
        senderName="Alice"
        createdAt="2026-06-25T12:00:00.000Z"
        isEdited={false}
        content="hello"
        reactions={reactions}
        attachments={[]}
        replyTo={null}
        bookmarked={false}
        onReact={onReact}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCheckboxToggle={vi.fn()}
        onReply={vi.fn()}
        onBookmark={vi.fn()}
        onMakeTask={vi.fn()}
        onJumpToMessage={vi.fn()}
        onCopyLink={vi.fn()}
        onImageClick={vi.fn()}
        isMobile
      />
    )
    const { rerender } = render(message)

    // リアクション行には入口を置かず、メッセージの「…」メニューから開く
    expect(screen.queryByRole('button', { name: 'リアクションした人を表示' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '操作' }))
    await user.click(screen.getByRole('button', { name: 'リアクションした人を表示' }))
    expect(onReact).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'リアクションした人を表示' })
    expect(dialog).toHaveTextContent('リアクション (4)')
    expect(dialog).toHaveTextContent('メンバーA')
    expect(dialog).not.toHaveTextContent('メンバーC')

    await user.click(within(dialog).getByRole('button', { name: '🎉 2件のリアクション' }))
    expect(dialog).not.toHaveTextContent('メンバーA')
    expect(dialog).toHaveTextContent('メンバーC')

    // 選択中の絵文字が消えたら、残っている絵文字の人を表示する
    rerender(cloneElement(message, { reactions: [{ emoji: '👍', count: 2, mine: false, userNames: ['メンバーB', '新しいメンバーD'] }] }))
    expect(dialog).toHaveTextContent('新しいメンバーD')
    expect(dialog).not.toHaveTextContent('メンバーC')
    // 消えた絵文字が付け直されても、操作なしで表示を戻さない
    rerender(cloneElement(message, { reactions: [{ emoji: '👍', count: 2, mine: false, userNames: ['メンバーB', '新しいメンバーD'] }, { emoji: '🎉', count: 1, mine: false, userNames: ['メンバーC'] }] }))
    expect(dialog).toHaveTextContent('新しいメンバーD')
    expect(within(dialog).getByRole('button', { name: '👍 2件のリアクション' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(dialog).getByRole('button', { name: '閉じる' }))
    await user.click(screen.getByRole('button', { name: /👍 2/ }))
    expect(onReact).toHaveBeenCalledWith('message-reactions', '👍')
    expect(screen.queryByRole('dialog', { name: 'リアクションした人を表示' })).not.toBeInTheDocument()
  })
})

describe('isNearMessageTimelineEnd', () => {
  it('末尾から80px以内を最新表示中として扱う', () => {
    expect(isNearMessageTimelineEnd({ scrollHeight: 1_000, scrollTop: 720, clientHeight: 200 })).toBe(true)
    expect(isNearMessageTimelineEnd({ scrollHeight: 1_000, scrollTop: 719, clientHeight: 200 })).toBe(false)
  })
})

describe('ChatThreadの初期既読', () => {
  beforeEach(() => {
    markChannelRead.mockReset()
    bookmarkMessage.mockReset()
    chatThreadState.initialMessageId = null
    chatThreadState.historyMessages = undefined
    chatThreadState.historyIsError = false
    localStorage.clear()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  })

  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })

  it('非表示タブでは既読にせず、表示された時点で既読にする', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <ChatThread channelId="channel-1" initialUnreadPosition isMobile />
      </QueryClientProvider>,
    )

    expect(markChannelRead).not.toHaveBeenCalled()

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    act(() => document.dispatchEvent(new Event('visibilitychange')))

    expect(markChannelRead).toHaveBeenCalledWith('channel-1')
  })

  it('履歴表示中に更新操作をしたら最新100件の表示へ戻す', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    chatThreadState.initialMessageId = 'history-message'
    chatThreadState.historyMessages = [{
      id: 'history-message', content: 'old message', messageType: 'text', senderId: 'user-2', senderName: 'Alice', senderAvatarUrl: null,
      createdAt: '2026-08-20T12:00:00.000Z', isEdited: false, reactions: [], attachments: [], parentMessageId: null,
      replyTo: null, bookmarked: false, blocked: false,
    }]
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <ChatThread channelId="channel-1" initialUnreadPosition isMobile />
      </QueryClientProvider>,
    )

    expect(screen.getByText('old message')).toBeInTheDocument()
    await user.click(screen.getByTitle('ブックマーク'))

    expect(bookmarkMessage).toHaveBeenCalledWith('history-message')
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.queryByText('old message')).toBeNull()
  })

  it('未読周辺の取得に失敗したら既読にせずエラーを表示する', () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    chatThreadState.initialMessageId = 'history-message'
    chatThreadState.historyIsError = true
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <ChatThread channelId="channel-1" initialUnreadPosition isMobile />
      </QueryClientProvider>,
    )

    expect(screen.getByText('メッセージの取得に失敗しました')).toBeInTheDocument()
    expect(markChannelRead).not.toHaveBeenCalled()
  })

})

describe('ChatThreadのメンション候補', () => {
  beforeEach(() => {
    chatThreadState.initialMessageId = null
    chatThreadState.historyMessages = undefined
    chatThreadState.historyIsError = false
    chatThreadState.projectChannels = []
    chatThreadState.projectChannelsResolved = true
    chatThreadState.projectChannelsError = null
    chatThreadState.refetchProjectChannels.mockClear()
    chatThreadState.projectMembers = []
    chatThreadState.profileAttributes = []
    chatThreadState.workspaceMembers = [
      ...Array.from({ length: 6 }, (_, index) => ({
        userId: `user-${index + 2}`,
        displayName: `候補${index + 1}`,
        role: 'member' as const,
      })),
      { userId: 'user-8', displayName: '鈴木', role: 'member' },
    ]
    localStorage.clear()
  })

  it('全候補をスクロール表示し、プロジェクトメンバー取得後は選択を先頭へ戻す', () => {
    chatThreadState.projectChannels = [{ channelId: 'channel-1', projectId: 'project-1' }]
    chatThreadState.profileAttributes = [
      { id: 'attr-coach', name: 'コーチ', color: 'blue' },
      { id: 'attr-grade', name: '3年生', color: 'emerald' },
    ]
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ChatThread channelId="channel-1" isMobile />
      </QueryClientProvider>,
    )

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '@' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    chatThreadState.projectMembers = [{ userId: 'user-8' }]
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ChatThread channelId="channel-1" isMobile />
      </QueryClientProvider>,
    )

    const projectMemberButton = screen.getByRole('button', { name: /@鈴木/ })
    const picker = projectMemberButton.parentElement!
    expect([...picker.querySelectorAll('button')].map(button => button.lastElementChild?.textContent)).toEqual([
      '@all全員',
      '@project_membersプロジェクトメンバー',
      '@鈴木',
      ...Array.from({ length: 6 }, (_, index) => `@候補${index + 1}`),
      '@コーチ属性',
      '@3年生属性',
    ])
    expect(picker).toHaveStyle({ maxHeight: '240px', overflowY: 'auto' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input.value).toBe('@all ')
  })

  it('プロジェクトに参加していないゲストは、チャンネル一覧の取得前も取得後も候補に出さない', () => {
    chatThreadState.workspaceMembers = [
      { userId: 'user-2', displayName: '鈴木', role: 'member' },
      { userId: 'guest-in', displayName: '参加ゲスト', role: 'guest' },
      { userId: 'guest-out', displayName: '未参加ゲスト', role: 'guest' },
    ]
    chatThreadState.projectChannelsResolved = false
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ChatThread channelId="channel-1" isMobile />
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '@' } })

    expect(screen.getByRole('button', { name: /@鈴木/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ゲスト/ })).toBeNull()

    chatThreadState.projectChannelsResolved = true
    chatThreadState.projectChannels = [{ channelId: 'channel-1', projectId: 'project-1' }]
    chatThreadState.projectMembers = [{ userId: 'guest-in' }]
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ChatThread channelId="channel-1" isMobile />
      </QueryClientProvider>,
    )

    expect(screen.getByRole('button', { name: /@参加ゲスト/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /@未参加ゲスト/ })).toBeNull()
  })

  it('チャンネル一覧を取得できない時は、一部の候補だけを出さずにエラーと再試行を表示する', async () => {
    const user = userEvent.setup()
    chatThreadState.projectChannelsResolved = false
    chatThreadState.projectChannelsError = new Error('チャンネルの取得に失敗しました')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <ChatThread channelId="channel-1" isMobile />
      </QueryClientProvider>,
    )
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '@' } })

    expect(screen.getByRole('alert')).toHaveTextContent('チャンネルの取得に失敗しました')
    expect(screen.queryByRole('button', { name: /@鈴木/ })).toBeNull()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input.value).toBe('@')

    // マウスだけでなく、キーボードの Enter / Space でも再試行できること
    const retryButton = screen.getByRole('button', { name: 'メンション候補を再読み込み' })
    await user.click(retryButton)
    expect(chatThreadState.refetchProjectChannels).toHaveBeenCalledTimes(1)
    retryButton.focus()
    await user.keyboard('{Enter}')
    expect(chatThreadState.refetchProjectChannels).toHaveBeenCalledTimes(2)
    await user.keyboard(' ')
    expect(chatThreadState.refetchProjectChannels).toHaveBeenCalledTimes(3)
  })

  it('日本語変換中は候補を選ばず、確定後に入力済みの名前で絞り込む', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <ChatThread channelId="channel-1" isMobile />
      </QueryClientProvider>,
    )
    const input = screen.getByRole('textbox') as HTMLTextAreaElement

    fireEvent.change(input, { target: { value: '@' } })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: true })
    expect(input.value).toBe('@')

    fireEvent.change(input, { target: { value: '@鈴木', selectionStart: 1 } })
    expect(screen.getByRole('button', { name: /@候補1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /@鈴木/ })).toBeInTheDocument()

    input.setSelectionRange(3, 3)
    fireEvent.compositionEnd(input)

    expect(screen.getByRole('button', { name: /@鈴木/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /@候補1/ })).toBeNull()
  })
})


describe('ChatThreadの送信キー切替', () => {
  beforeEach(() => {
    localStorage.clear()
    sendMessage.mockReset()
    chatThreadState.sendError = null
  })

  it.each([false, true])('通常表示/compact表示のどちらでも切替を保存し、即時反映する (compact=%s)', async compact => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ChatThread channelId="channel-1" compact={compact} isMobile />
      </QueryClientProvider>,
    )

    const toggle = screen.getByRole('switch', { name: 'Enterで送信' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(localStorage.getItem('cairn:chat_send_key')).toBe('enter')
  })

  it('同じ画面の複数チャットとstorageイベントで設定を同期する', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <><ChatThread channelId="channel-1" /><ChatThread channelId="channel-2" /></>
      </QueryClientProvider>,
    )
    const [first, second] = screen.getAllByRole('switch', { name: 'Enterで送信' })
    const [firstInput, secondInput] = screen.getAllByRole('textbox') as HTMLTextAreaElement[]

    await user.click(first!)
    expect(first).toHaveAttribute('aria-checked', 'true')
    expect(second).toHaveAttribute('aria-checked', 'true')
    fireEvent.change(secondInput!, { target: { value: 'second composer' } })
    fireEvent.keyDown(secondInput!, { key: 'Enter' })
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))

    localStorage.setItem('cairn:chat_send_key', 'modifier-enter')
    fireEvent(window, new StorageEvent('storage', { key: 'cairn:chat_send_key' }))
    expect(first).toHaveAttribute('aria-checked', 'false')
    expect(second).toHaveAttribute('aria-checked', 'false')
    fireEvent.change(firstInput!, { target: { value: 'first composer' } })
    fireEvent.keyDown(firstInput!, { key: 'Enter' })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(firstInput!, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
  })

  it('送信エラーを設定の保存成功や失敗で消さず、保存失敗時はスイッチを戻さない', async () => {
    const user = userEvent.setup()
    chatThreadState.sendError = new Error('送信に失敗しました')
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ChatThread channelId="channel-1" />
      </QueryClientProvider>,
    )
    const toggle = screen.getByRole('switch', { name: 'Enterで送信' })
    expect(await screen.findByText('送信に失敗しました')).toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('送信に失敗しました')).toBeInTheDocument()

    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('storage unavailable') })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('送信に失敗しました')).toBeInTheDocument()
    expect(screen.getByText('このブラウザにチャット入力設定を保存できませんでした。')).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('保存済みの明示設定はモバイルでも使い、変換確定のEnterでは送信しない', () => {
    localStorage.setItem('cairn:chat_send_key', 'enter')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ChatThread channelId="channel-1" isMobile />
      </QueryClientProvider>,
    )

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(screen.getByRole('switch', { name: 'Enterで送信' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: true })
    expect(sendMessage).not.toHaveBeenCalled()

    view.unmount()
  })
})
