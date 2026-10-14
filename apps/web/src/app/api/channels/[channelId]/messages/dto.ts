// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { AttachmentDto, MessageType, ProfileAttributeDto, ProjectMemberRole } from '@cairn/shared'

export interface ReactionDto {
  emoji: string
  count: number
  mine: boolean
  // リアクションしたユーザーの表示名（PC ではホバー、モバイルWebでは「…」メニューから開くシートで表示する）
  userNames: string[]
}

// 引用返信の参照先メッセージのサマリ
export interface ReplyToDto {
  id: string
  senderName: string
  content: string
  isDeleted: boolean
}

// メッセージを出典とするタスク（タスク化済みの印と遷移先に使う）
export interface LinkedTaskDto {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  /** メッセージ本文（DB の canonical）を `\n` で分けたときの元の行番号（0始まり）。対応する行が無ければ null */
  lineIndex: number | null
}

export interface MessageDto {
  id: string
  content: string
  messageType: MessageType
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  senderProfileAttributes?: ProfileAttributeDto[]
  senderProjectRole?: ProjectMemberRole | null
  senderProjectRoleName?: string | null
  senderProjectRoleColor?: string | null
  /** project_roles.legacy_role。カスタム役割は null */
  senderProjectRoleLegacy?: ProjectMemberRole | null
  createdAt: string
  isEdited: boolean
  reactions: ReactionDto[]
  attachments: AttachmentDto[]
  parentMessageId: string | null
  replyTo: ReplyToDto | null
  bookmarked: boolean
  /** このメッセージをタスク化したタスク（作成順）。無ければ空配列 */
  linkedTasks: LinkedTaskDto[]
  blocked?: boolean
}
