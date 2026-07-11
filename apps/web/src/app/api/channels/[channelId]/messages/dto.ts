// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { AttachmentDto, MessageType } from '@cairn/shared'

export interface ReactionDto {
  emoji: string
  count: number
  mine: boolean
  // リアクションしたユーザーの表示名（PC ではホバーで一覧表示する）
  userNames: string[]
}

// 引用返信の参照先メッセージのサマリ
export interface ReplyToDto {
  id: string
  senderName: string
  content: string
  isDeleted: boolean
}

export interface MessageDto {
  id: string
  content: string
  messageType: MessageType
  senderId: string
  senderKind: 'human' | 'bot'
  senderName: string
  senderAvatarUrl: string | null
  createdAt: string
  isEdited: boolean
  reactions: ReactionDto[]
  attachments: AttachmentDto[]
  parentMessageId: string | null
  replyTo: ReplyToDto | null
  bookmarked: boolean
}
