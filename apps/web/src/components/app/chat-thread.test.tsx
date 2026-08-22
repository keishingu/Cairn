// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ChatMessage,
  copyMessageContent,
  copyMessageLink,
  isNearMessageTimelineEnd,
} from './chat-thread'

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

let clipboardWriteText: ReturnType<typeof vi.fn>

vi.mock('@/lib/chat/client', () => ({
  formatChatMessageTime: () => '12:34',
  useChannelMembers: vi.fn(),
  useChannelMessages: vi.fn(),
  useCurrentUser: vi.fn(),
  useDeleteMessage: vi.fn(),
  useEditMessage: vi.fn(),
  useMarkChannelRead: vi.fn(),
  useSendChannelMessage: vi.fn(),
  useToggleMessageReaction: vi.fn(),
  useWorkspaceMembers: vi.fn(),
}))

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
})

describe('isNearMessageTimelineEnd', () => {
  it('末尾から80px以内を最新表示中として扱う', () => {
    expect(isNearMessageTimelineEnd({ scrollHeight: 1_000, scrollTop: 720, clientHeight: 200 })).toBe(true)
    expect(isNearMessageTimelineEnd({ scrollHeight: 1_000, scrollTop: 719, clientHeight: 200 })).toBe(false)
  })
})
