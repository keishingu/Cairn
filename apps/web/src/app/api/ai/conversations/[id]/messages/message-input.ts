// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { CoreMessage } from 'ai'
import { z } from 'zod'
import { AI_ATTACHMENT_MAX_FILES } from '@/lib/ai/attachment-types'
import { buildUserContentParts, type PreparedAttachment } from '@/lib/ai/attachments'

export const MAX_HISTORY_MESSAGES = 40
export const MAX_REQUEST_BODY_BYTES = 64 * 1024
const MAX_MESSAGE_CHARS = 4000

const clientMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
}).passthrough()

const aiRequestSchema = z.object({
  messages: z.array(clientMessageSchema).min(1),
  // 会話に上げた添付（送信前のもの）。本体は Storage にあり、ここでは ID だけを受け取る
  attachmentIds: z.array(z.string().uuid()).max(AI_ATTACHMENT_MAX_FILES).optional(),
})

export interface StoredConversationMessage {
  id?: string
  role: string
  content: string
  createdAt?: Date | string | null
  annotations?: unknown[] | null
  toolInvocations?: unknown[] | null
}

const MESSAGE_ROLE_ORDER = {
  user: 0,
  assistant: 1,
} as const

export function parseLatestUserInput(body: unknown): { lastUserContent: string; clientMessageCount: number; attachmentIds: string[] } {
  const parsed = aiRequestSchema.safeParse(body)
  if (!parsed.success) {
    if (parsed.error.issues.some(issue => issue.path[0] === 'attachmentIds')) {
      throw new Error(`添付は${AI_ATTACHMENT_MAX_FILES}個まで、会話に上げた添付の ID で指定してください`)
    }
    throw new Error('messages は user/assistant の文字列メッセージ配列で指定してください')
  }

  const lastMessage = parsed.data.messages.at(-1)

  if (!lastMessage) {
    throw new Error('messages が空です')
  }

  if (lastMessage.role !== 'user') {
    throw new Error('最後のメッセージは user である必要があります')
  }

  const lastUserContent = lastMessage.content.trim()
  if (!lastUserContent) {
    throw new Error('ユーザーメッセージが空です')
  }
  if (lastUserContent.length > MAX_MESSAGE_CHARS) {
    throw new Error(`ユーザーメッセージは ${MAX_MESSAGE_CHARS} 文字以内で指定してください`)
  }

  return {
    lastUserContent,
    clientMessageCount: parsed.data.messages.length,
    attachmentIds: parsed.data.attachmentIds ?? [],
  }
}

type HistoryAttachment = Parameters<typeof buildUserContentParts>[1][number]

export function buildModelMessages(
  history: StoredConversationMessage[],
  lastUserContent: string,
  attachments: {
    /** 今回の依頼に付けた添付 */
    latest?: PreparedAttachment[]
    /** 履歴の利用者のメッセージに付いていた添付（メッセージ ID ごと） */
    history?: Map<string, HistoryAttachment[]>
  } = {},
): CoreMessage[] {
  const normalizedHistory = normalizeStoredConversationMessages(history)
    // 本文のない応答（tool 結果だけ）はモデルの履歴に入れない
    .filter(message => message.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES)
    .map<CoreMessage>(message => {
      const historyAttachments = message.role === 'user' && message.id ? attachments.history?.get(message.id) : undefined
      return historyAttachments && historyAttachments.length > 0
        ? { role: 'user', content: buildUserContentParts(message.content, historyAttachments) }
        : { role: message.role, content: message.content }
    })

  const latest = attachments.latest ?? []
  return [
    ...normalizedHistory,
    latest.length > 0
      ? { role: 'user', content: buildUserContentParts(lastUserContent, latest) }
      : { role: 'user', content: lastUserContent },
  ]
}

export function normalizeStoredConversationMessages(
  history: StoredConversationMessage[],
): Array<StoredConversationMessage & { role: 'user' | 'assistant' }>
export function normalizeStoredConversationMessages<T extends StoredConversationMessage>(
  history: T[],
): Array<T & { role: 'user' | 'assistant' }>
export function normalizeStoredConversationMessages<T extends StoredConversationMessage>(
  history: T[],
): Array<T & { role: 'user' | 'assistant' }> {
  return history
    .filter((message): message is T & { role: 'user' | 'assistant' } =>
      (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string' && (
        message.content.length > 0
        // 本文がなくても tool 結果（スキルの承認カードなど）を持つ応答は残す。消すと会話を開き直したときに承認カードへ戻れない
        || (message.role === 'assistant' && Array.isArray(message.toolInvocations) && message.toolInvocations.length > 0)
      ),
    )
    .sort(compareStoredConversationMessages)
}

function compareStoredConversationMessages(
  left: StoredConversationMessage & { role: 'user' | 'assistant' },
  right: StoredConversationMessage & { role: 'user' | 'assistant' },
) {
  const leftTimestamp = toTimestamp(left.createdAt)
  const rightTimestamp = toTimestamp(right.createdAt)

  if (leftTimestamp !== null && rightTimestamp !== null) {
    const createdAtDiff = leftTimestamp - rightTimestamp
    if (createdAtDiff !== 0) return createdAtDiff
  } else if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp === null ? -1 : 1
  }

  const roleDiff = MESSAGE_ROLE_ORDER[left.role] - MESSAGE_ROLE_ORDER[right.role]
  if (roleDiff !== 0) return roleDiff

  return (left.id ?? '').localeCompare(right.id ?? '')
}

function toTimestamp(createdAt: StoredConversationMessage['createdAt']) {
  if (createdAt instanceof Date) return createdAt.getTime()
  if (typeof createdAt === 'string') {
    const timestamp = new Date(createdAt).getTime()
    return Number.isNaN(timestamp) ? null : timestamp
  }
  return null
}
