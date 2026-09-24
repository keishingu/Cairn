// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ChatMessage,
  ChatThread,
  copyMessageContent,
  copyMessageLink,
  isNearMessageTimelineEnd,
} from './chat-thread'

const { toastSuccess, toastError, markChannelRead, bookmarkMessage, chatThreadState } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  markChannelRead: vi.fn(),
  bookmarkMessage: vi.fn(),
  chatThreadState: {
    initialMessageId: null as string | null,
    historyMessages: undefined as Array<Record<string, unknown>> | undefined,
    historyIsError: false,
    workspaceMembers: [] as Array<{ userId: string; displayName: string; role: 'member' | 'guest' }>,
    projectChannels: [] as Array<{ channelId: string; projectId: string }>,
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
  useProjectChannels: () => ({ data: chatThreadState.projectChannels }),
  useSendChannelMessage: () => ({ mutate: vi.fn(), isError: false, isSuccess: false, isPending: false, error: null }),
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

  it('元の本文をそのままコピーして成功トーストを出す', async () => {
    const content = 'https://example.com/very/long/path?token=abcdef1234567890&next=%2Fprojects%2Falpha'

    await expect(copyMessageContent(content)).resolves.toBe(true)

    expect(clipboardWriteText).toHaveBeenCalledWith(content)
    expect(toastSuccess).toHaveBeenCalledWith('メッセージをコピーしました')
  })

  it('コピーに失敗したらエラートーストを出す', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    await expect(copyMessageContent('hello')).resolves.toBe(false)

    expect(writeText).toHaveBeenCalledWith('hello')
    expect(toastError).toHaveBeenCalledWith('メッセージをコピーできませんでした')
  })

  it('メッセージのリンクをコピーして成功トーストを出す', async () => {
    const url = 'https://develop.oss-cairn.com/chats/channel-1?m=message-1'

    await expect(copyMessageLink(url)).resolves.toBe(true)

    expect(clipboardWriteText).toHaveBeenCalledWith(url)
    expect(toastSuccess).toHaveBeenCalledWith('リンクをコピーしました')
  })

  it('メッセージのリンクをコピーできなければエラートーストを出す', async () => {
    clipboardWriteText.mockRejectedValue(new Error('denied'))

    await expect(copyMessageLink('https://develop.oss-cairn.com/chats/1')).resolves.toBe(false)

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
