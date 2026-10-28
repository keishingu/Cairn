// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { cloneElement } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translate } from '@cairn/shared'
import { encodeLinkedTasksKey } from '@/lib/tasks/linked-tasks-key'
import {
  ChatMessage,
  ChatThread,
  copyMessageContent,
  copyMessageLink,
  findInsertedMention,
  survivingMentionTokenIds,
  isNearMessageTimelineEnd,
  shouldFollowLatestMessage,
  fetchMessageTaskCandidates,
  makeTasksFromMessage,
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

const { routerPush, fetchWithAuthMock, toastSuccess, toastError, markChannelRead, bookmarkMessage, sendMessage, chatThreadState } = vi.hoisted(() => ({
  routerPush: vi.fn(),
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
const uploadAttachmentMock = vi.hoisted(() => vi.fn())

let clipboardWriteText: ReturnType<typeof vi.fn>

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }))

vi.mock('@/lib/chat/client', () => ({
  chatQueryKeys: { messages: (channelId: string | null) => ['messages', channelId] },
  ChannelMessagesError: class ChannelMessagesError extends Error {},
  formatChatMessageTime: () => '12:34',
  useChannelInitialMessage: () => ({ data: { messageId: chatThreadState.initialMessageId }, isFetched: true, isFetching: false, isError: false }),
  useChannelMessageHistory: () => ({ data: chatThreadState.historyMessages, isFetched: true, isLoading: false, isError: chatThreadState.historyIsError }),
  useChannelMembers: () => ({ data: [] }),
  useChannelMessages: () => ({
    data: [{
      id: 'message-1', content: 'hello', messageType: 'text', senderId: 'user-2', senderName: 'Alice', senderAvatarUrl: null,
      createdAt: '2026-08-23T12:00:00.000Z', isEdited: false, reactions: [], attachments: [], parentMessageId: null,
      replyTo: null, bookmarked: false, linkedTasks: [], blocked: false,
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
vi.mock('@/lib/attachments/upload-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/attachments/upload-client')>()),
  uploadAttachment: uploadAttachmentMock,
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

  describe('タスク化済みの印', () => {
    type LinkedTask = { id: string; title: string; status: 'todo' | 'in_progress' | 'done'; lineIndex: number | null }
    function renderLinked(linkedTasks: LinkedTask[], onMakeTask = vi.fn(), content = '資料を確認する', messageType: 'text' | 'blocks' = 'text') {
      return render(
        <ChatMessage
          messageId="message-1"
          messageType={messageType}
          {...(messageType === 'blocks' ? { blocks: [{ type: 'section', block_id: 's', text: { type: 'plain_text', text: content } }] } : {})}
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
          linkedTasksKey={encodeLinkedTasksKey(linkedTasks)}
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
    }
    const task = (id: string, status: LinkedTask['status'], title = `タスク${id}`, lineIndex: number | null = null): LinkedTask => ({ id, title, status, lineIndex })

    it('タスク化されていなければチップを出さない', () => {
      renderLinked([])
      expect(screen.queryByTestId('linked-task-chip')).toBeNull()
    })

    it('1件なら「タスク」チップからそのタスク画面へのリンクを出す', () => {
      renderLinked([task('task-1', 'todo')])
      const chip = screen.getByTestId('linked-task-chip')
      expect(chip).toHaveTextContent('タスク')
      expect(chip).toHaveAttribute('href', '/tasks?taskId=task-1')
      expect(chip).toHaveAttribute('data-task-status', 'todo')
    })

    it('1件で完了したタスクは完了の見た目（薄い色）で出す', () => {
      renderLinked([task('task-1', 'done')])
      const chip = screen.getByTestId('linked-task-chip')
      expect(chip).toHaveAttribute('data-task-status', 'done')
      expect(chip).toHaveStyle({ opacity: '0.75' })
    })

    it('2件以上なら「タスク 完了数/総数」を出し、押すと一覧から選んでタスク画面へ遷移する', async () => {
      const user = userEvent.setup()
      routerPush.mockClear()
      renderLinked([task('task-1', 'done', '資料を確認する'), task('task-2', 'todo', '日程を調整する'), task('task-3', 'in_progress', '会場を押さえる')])

      const chip = screen.getByTestId('linked-task-chip')
      expect(chip).toHaveTextContent('タスク 1/3')
      await user.click(chip)
      expect(screen.getByRole('button', { name: /資料を確認する/ })).toHaveTextContent('完了')
      expect(screen.getByRole('button', { name: /会場を押さえる/ })).toHaveTextContent('進行中')
      await user.click(screen.getByRole('button', { name: /日程を調整する/ }))

      expect(routerPush).toHaveBeenCalledWith('/tasks?taskId=task-2')
    })

    it('2件以上がすべて完了なら完了の見た目（薄い色）で出す', () => {
      renderLinked([task('task-1', 'done'), task('task-2', 'done')])
      const chip = screen.getByTestId('linked-task-chip')
      expect(chip).toHaveTextContent('タスク 2/2')
      expect(chip).toHaveStyle({ opacity: '0.75' })
    })

    it('カードのメッセージは行末ラベルを出せないので、代替テキストの行に対応するタスクもチップで出す', () => {
      renderLinked([task('task-1', 'todo', '資料を確認する', 0)], vi.fn(), '資料を確認する', 'blocks')
      expect(screen.queryByTestId('line-task-label')).toBeNull()
      expect(screen.getByTestId('linked-task-chip')).toHaveAttribute('href', '/tasks?taskId=task-1')
    })

    describe('行末ラベル', () => {
      it('リスト項目と段落の行末に「タスク」ラベルを出し、押すとタスク画面へのリンクになる', () => {
        renderLinked([task('task-1', 'todo', 'a', 1), task('task-2', 'todo', 'b', 3)], vi.fn(), '前置き\n- 買い出し\n\n段落の行')
        const labels = screen.getAllByTestId('line-task-label')
        expect(labels).toHaveLength(2)
        expect(labels[0]).toHaveAttribute('href', '/tasks?taskId=task-1')
        expect(labels[0]!.closest('li')).toHaveTextContent('買い出し')
        expect(labels[1]).toHaveAttribute('href', '/tasks?taskId=task-2')
        expect(labels[1]!.closest('p')).toHaveTextContent('段落の行')
      })

      it('全部が行末に出ていれば下部のチップは出さない', () => {
        renderLinked([task('task-1', 'todo', 'a', 0)], vi.fn(), '買い出し')
        expect(screen.getByTestId('line-task-label')).toBeInTheDocument()
        expect(screen.queryByTestId('linked-task-chip')).toBeNull()
      })

      it('未完了はアクセント色、完了は薄い色で出す', () => {
        renderLinked([task('task-1', 'todo', 'a', 0), task('task-2', 'done', 'b', 1)], vi.fn(), 'A\nB')
        const [open, done] = screen.getAllByTestId('line-task-label')
        expect(open).toHaveAttribute('data-task-status', 'todo')
        expect(open).toHaveStyle({ opacity: '1' })
        expect(done).toHaveAttribute('data-task-status', 'done')
        expect(done).toHaveStyle({ opacity: '0.75' })
      })

      it('行に対応しないタスクだけを下部のチップで示す', () => {
        renderLinked([task('task-1', 'todo', 'a', 0), task('task-2', 'todo', 'b', null), task('task-3', 'todo', 'c', 9)], vi.fn(), '買い出し')
        expect(screen.getAllByTestId('line-task-label')).toHaveLength(1)
        expect(screen.getByTestId('linked-task-chip')).toHaveTextContent('タスク 0/2')
      })

      it('コードブロックの行には出さず、下部のチップで示す', () => {
        renderLinked([task('task-1', 'todo', 'a', 1)], vi.fn(), '```\nconst a = 1\n```')
        expect(screen.queryByTestId('line-task-label')).toBeNull()
        expect(screen.getByTestId('linked-task-chip')).toHaveAttribute('href', '/tasks?taskId=task-1')
      })

      it('表示用の目印はコピー対象の本文には混ざらない', () => {
        const { container } = renderLinked([task('task-1', 'todo', 'a', 0)], vi.fn(), '買い出し')
        expect(container.textContent).not.toMatch(/[\uE000\uE001]/)
      })
    })

    it('タスク化済みでも「…」メニューは常に「タスク化する」を出す', async () => {
      const user = userEvent.setup()
      const onMakeTask = vi.fn()
      renderLinked([task('task-1', 'todo')], onMakeTask)

      await user.click(screen.getByTitle('操作'))
      expect(screen.queryByRole('button', { name: 'タスクを開く' })).toBeNull()
      await user.click(screen.getByRole('button', { name: 'タスク化する' }))

      expect(onMakeTask).toHaveBeenCalledWith('message-1')
    })
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

  it('候補の取得は GET で行い、候補一覧を返す', async () => {
    const candidates = [{ title: '資料を確認する', isListItem: true, taskId: null }]
    fetchWithAuthMock.mockResolvedValue({ ok: true, json: async () => ({ candidates, tasks: [] }) })

    await expect(fetchMessageTaskCandidates('message-1', copyT)).resolves.toEqual(candidates)

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/messages/message-1/task')
  })

  it('候補の取得に失敗したらエラートーストを出して null を返す', async () => {
    fetchWithAuthMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'メッセージが見つかりません' }) })

    await expect(fetchMessageTaskCandidates('message-1', copyT)).resolves.toBeNull()

    expect(toastError).toHaveBeenCalledWith('メッセージが見つかりません')
  })

  it('1件作成したら「タスクに追加しました」とそのタスクを開くリンクのトーストを出す', async () => {
    fetchWithAuthMock.mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [{ id: 'task-1', title: '資料を確認する', status: 'todo' }], createdCount: 1 }),
    })

    await expect(makeTasksFromMessage('message-1', [{ line: '資料を確認する', title: '資料を最優先で確認する' }], copyT)).resolves.toBe(true)

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/messages/message-1/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ line: '資料を確認する', title: '資料を最優先で確認する' }] }),
    })
    expect(toastSuccess).toHaveBeenCalledWith('タスクに追加しました', {
      action: { label: '開く', href: '/tasks?taskId=task-1' },
    })
  })

  it('複数件作成したら件数のトーストを出し、開くリンクはタスク一覧にする', async () => {
    fetchWithAuthMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        tasks: [{ id: 'task-1', title: 'a', status: 'todo' }, { id: 'task-2', title: 'b', status: 'todo' }],
        createdCount: 2,
      }),
    })

    await expect(makeTasksFromMessage('message-1', [{ line: 'a', title: 'a' }, { line: 'b', title: 'b' }], copyT)).resolves.toBe(true)

    expect(toastSuccess).toHaveBeenCalledWith('2件のタスクを追加しました', {
      action: { label: '開く', href: '/tasks' },
    })
  })

  it('1件も新規作成されなければ「このメッセージは既にタスクです」と開くリンクのトーストを出す', async () => {
    fetchWithAuthMock.mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [{ id: 'task-1', title: 'a', status: 'todo' }], createdCount: 0 }),
    })

    await expect(makeTasksFromMessage('message-1', [{ line: 'a', title: 'a' }], copyT)).resolves.toBe(true)

    expect(toastSuccess).toHaveBeenCalledWith('このメッセージは既にタスクです', {
      action: { label: '開く', href: '/tasks?taskId=task-1' },
    })
  })

  it('APIが失敗したらそのエラー文言をエラートーストに出す', async () => {
    fetchWithAuthMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'タスク名は1〜50件、各1〜200文字で指定してください' }),
    })

    await expect(makeTasksFromMessage('message-1', [{ line: 'a', title: 'a' }], copyT)).resolves.toBe(false)

    expect(toastError).toHaveBeenCalledWith('タスク名は1〜50件、各1〜200文字で指定してください')
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('通信に失敗したら汎用のエラートーストを出す', async () => {
    fetchWithAuthMock.mockRejectedValue(new Error('network'))

    await expect(makeTasksFromMessage('message-1', [{ line: 'a', title: 'a' }], copyT)).resolves.toBe(false)

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

describe('ChatMessageの「スレッドに切り出す」メニュー', () => {
  const baseProps = {
    messageId: 'message-1',
    messageType: 'text' as const,
    senderId: 'user-2',
    currentUserId: 'user-1',
    senderName: 'Alice',
    createdAt: '2026-06-25T12:00:00.000Z',
    isEdited: false,
    content: '相談です',
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
    isMobile: true,
  }

  it('切り出しの導線を渡された親ワークスペースチャンネルでは、メニューに項目を出して選ぶと呼ぶ', async () => {
    const user = userEvent.setup()
    const onMoveToThread = vi.fn()
    render(<ChatMessage {...baseProps} onMoveToThread={onMoveToThread} />)

    await user.click(screen.getByTitle('操作'))
    await user.click(screen.getByRole('button', { name: 'スレッドに切り出す' }))

    expect(onMoveToThread).toHaveBeenCalledWith('message-1')
  })

  it('スレッド・プロジェクト・DM・ゲストなど導線を渡されない場合は項目を出さない', async () => {
    const user = userEvent.setup()
    render(<ChatMessage {...baseProps} />)

    await user.click(screen.getByTitle('操作'))

    expect(screen.getByRole('button', { name: 'コピー' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'スレッドに切り出す' })).toBeNull()
  })

  it('システムメッセージにはメニュー自体を出さない', () => {
    render(<ChatMessage {...baseProps} messageType="system" onMoveToThread={vi.fn()} />)

    expect(screen.queryByTitle('操作')).toBeNull()
    expect(screen.queryByRole('button', { name: 'スレッドに切り出す' })).toBeNull()
  })

  it('選択モードではチェックボックスを出し、切り替えを通知してメニューは隠す', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<ChatMessage {...baseProps} onMoveToThread={vi.fn()} selection={{ selected: true, onToggle }} />)

    const checkbox = screen.getByRole('checkbox', { name: 'メッセージを選択' })
    expect(checkbox).toBeChecked()
    expect(screen.queryByTitle('操作')).toBeNull()

    await user.click(checkbox)

    expect(onToggle).toHaveBeenCalledWith('message-1')
  })
})

describe('リアクションした人の表示', () => {
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

  it('PCではホバーで先頭10人と残り人数を表示し、全員は「…」メニューから開ける', async () => {
    const user = userEvent.setup()
    const userNames = Array.from({ length: 12 }, (_, index) => `メンバー${index + 1}`)
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
        reactions={[{ emoji: '👍', count: 12, mine: false, userNames }]}
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

    await user.hover(screen.getByRole('button', { name: /👍 12/ }))
    const tooltip = screen.getByText(/メンバー1、/)
    expect(tooltip).toHaveTextContent('メンバー10 他 2 人')
    expect(tooltip).not.toHaveTextContent('メンバー11')

    fireEvent.click(screen.getByRole('button', { name: '操作' }))
    fireEvent.click(screen.getByRole('button', { name: 'リアクションした人を表示' }))
    const dialog = screen.getByRole('dialog', { name: 'リアクションした人を表示' })
    expect(dialog).toHaveTextContent('メンバー12')
  })

  it('PCで画面の右上に近いリアクションは、ツールチップをボタンの右端に揃えて下に出す', async () => {
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
        reactions={[{ emoji: '👍', count: 1, mine: false, userNames: ['メンバーA'] }]}
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
    const chip = screen.getByRole('button', { name: /👍 1/ }).parentElement!
    vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue({ left: window.innerWidth - 60, right: window.innerWidth - 10, top: 40, bottom: 64, width: 50, height: 24, x: window.innerWidth - 60, y: 40, toJSON: () => ({}) })

    await user.hover(chip)
    const tooltip = screen.getByText('メンバーA')
    expect(tooltip.style.right).toBe('10px')
    expect(tooltip.style.left).toBe('')
    expect(tooltip.style.top).toBe('70px')
    expect(tooltip.style.bottom).toBe('')
  })
})

describe('isNearMessageTimelineEnd', () => {
  it('末尾から80px以内を最新表示中として扱う', () => {
    expect(isNearMessageTimelineEnd({ scrollHeight: 1_000, scrollTop: 720, clientHeight: 200 })).toBe(true)
    expect(isNearMessageTimelineEnd({ scrollHeight: 1_000, scrollTop: 719, clientHeight: 200 })).toBe(false)
  })
})

describe('shouldFollowLatestMessage', () => {
  const base = {
    justPositioned: false,
    isNearEnd: false,
    wasAtLatest: false,
    latestChanged: true,
    latestSenderId: 'other',
    currentUserId: 'me',
  }

  it('増える前に末尾にいれば、長文で閾値を超えても追従する', () => {
    expect(shouldFollowLatestMessage({ ...base, wasAtLatest: true })).toBe(true)
  })

  it('自分の送信は読み返し中でも末尾へ追従する', () => {
    expect(shouldFollowLatestMessage({ ...base, latestSenderId: 'me' })).toBe(true)
  })

  it('読み返し中に他人の発言が届いても位置を動かさない', () => {
    expect(shouldFollowLatestMessage(base)).toBe(false)
    expect(shouldFollowLatestMessage({ ...base, latestSenderId: undefined, currentUserId: undefined })).toBe(false)
  })

  it('AI ナッジの増減だけなら、最新が自分の発言でも読み返し位置を動かさない', () => {
    expect(shouldFollowLatestMessage({ ...base, latestChanged: false, latestSenderId: 'me' })).toBe(false)
  })

  it('初期位置決めの直後は、未読位置・リンク先の実測位置を尊重する', () => {
    expect(shouldFollowLatestMessage({ ...base, justPositioned: true, wasAtLatest: true, latestSenderId: 'me' })).toBe(false)
    expect(shouldFollowLatestMessage({ ...base, justPositioned: true, isNearEnd: true })).toBe(true)
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
      replyTo: null, bookmarked: false, linkedTasks: [], blocked: false,
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

describe('ChatThreadのアップロード中のチャンネル切替', () => {
  let createObjectURLDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    uploadAttachmentMock.mockReset()
    localStorage.clear()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  })

  afterEach(() => {
    if (createObjectURLDescriptor) Object.defineProperty(URL, 'createObjectURL', createObjectURLDescriptor)
    else Reflect.deleteProperty(URL, 'createObjectURL')
  })

  it('旧チャンネルのアップロード中でも新チャンネルで選択でき、旧完了分を追加しない', async () => {
    createObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:mock-upload') })
    let finishOldUpload: ((value: { fileId: string; fileName: string; mimeType: string; fileSize: number }) => void) | undefined
    uploadAttachmentMock
      .mockImplementationOnce(() => new Promise(resolve => { finishOldUpload = resolve }))
      .mockResolvedValueOnce({ fileId: 'new-file', fileName: 'new.pdf', mimeType: 'application/pdf', fileSize: 3 })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ChatThread channelId="channel-1" />
      </QueryClientProvider>,
    )
    const oldInput = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(oldInput, { target: { files: [new File(['old'], 'old.pdf', { type: 'application/pdf' })] } })

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ChatThread channelId="channel-2" />
      </QueryClientProvider>,
    )
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ChatThread channelId="channel-1" />
      </QueryClientProvider>,
    )
    const newInput = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(newInput, { target: { files: [new File(['new'], 'new.pdf', { type: 'application/pdf' })] } })
    await waitFor(() => expect(screen.getByText('new.pdf')).toBeInTheDocument())
    await act(async () => {
      finishOldUpload?.({ fileId: 'old-file', fileName: 'old.pdf', mimeType: 'application/pdf', fileSize: 3 })
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(screen.getByText('new.pdf')).toBeInTheDocument()
    expect(screen.queryByText('old.pdf')).toBeNull()
    view.unmount()
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

  it('Enter送信モードでもCommand/Ctrl+Enterで送信する', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ChatThread channelId="channel-1" />
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('switch', { name: 'Enterで送信' }))
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'ctrl send' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))

    fireEvent.change(input, { target: { value: 'command send' } })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
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

describe('findInsertedMention', () => {
  it('本文に残っている @表示名 の位置を返す', () => {
    expect(findInsertedMention('確認 @小川聡 よろしく', '小川聡')).toBe(3)
  })

  it('名前の途中で続く別人の名前はメンション済みとみなさない', () => {
    expect(findInsertedMention('@小川聡太 よろしく', '小川聡')).toBeNull()
  })

  it('消したメンションはメンション済みとみなさない', () => {
    expect(findInsertedMention('よろしく', '小川聡')).toBeNull()
  })
})

describe('survivingMentionTokenIds', () => {
  const ogawaA = { tokenId: 'user-a', displayName: '小川聡' }
  const ogawaB = { tokenId: 'user-b', displayName: '小川聡' }

  it('同名の2人を入れて1件消すと、先に入れた方だけを本文に残っているとみなす', () => {
    expect(survivingMentionTokenIds('@小川聡 よろしく', [ogawaA, ogawaB])).toEqual(new Set(['user-a']))
  })

  it('同名の2人がどちらも本文に残っていれば両方を返す', () => {
    expect(survivingMentionTokenIds('@小川聡 @小川聡 よろしく', [ogawaA, ogawaB])).toEqual(new Set(['user-a', 'user-b']))
  })

  it('人と役割のラベルが同じでも1件ずつ割り当てる', () => {
    const role = { tokenId: 'role:design', displayName: 'デザイン' }
    const user = { tokenId: 'user-c', displayName: 'デザイン' }
    expect(survivingMentionTokenIds('@デザイン 確認', [role, user])).toEqual(new Set(['role:design']))
  })
})
