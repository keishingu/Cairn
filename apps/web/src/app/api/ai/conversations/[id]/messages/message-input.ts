// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { CoreMessage } from 'ai'
import { z } from 'zod'

const MAX_HISTORY_MESSAGES = 40
const MAX_MESSAGE_CHARS = 4000

const aiRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1),
})

const clientMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
}).passthrough()

export interface StoredConversationMessage {
  role: string
  content: string
}

export function parseLatestUserInput(body: unknown): { lastUserContent: string; clientMessageCount: number } {
  const parsed = aiRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new Error('messages は user/assistant の文字列メッセージを 1〜50 件で指定してください')
  }

  const lastMessage = clientMessageSchema.safeParse(parsed.data.messages.at(-1))
  if (!lastMessage.success) {
    throw new Error('最後のメッセージは user/assistant の文字列メッセージで指定してください')
  }

  if (lastMessage.data.role !== 'user') {
    throw new Error('最後のメッセージは user である必要があります')
  }

  const lastUserContent = lastMessage.data.content.trim()
  if (!lastUserContent) {
    throw new Error('ユーザーメッセージが空です')
  }
  if (lastUserContent.length > MAX_MESSAGE_CHARS) {
    throw new Error(`ユーザーメッセージは ${MAX_MESSAGE_CHARS} 文字以内で指定してください`)
  }

  return {
    lastUserContent,
    clientMessageCount: parsed.data.messages.length,
  }
}

export function buildModelMessages(
  history: StoredConversationMessage[],
  lastUserContent: string,
): CoreMessage[] {
  const normalizedHistory = history
    .filter((message): message is StoredConversationMessage & { role: 'user' | 'assistant' } =>
      (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string' && message.content.length > 0,
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map<CoreMessage>(message => ({
      role: message.role,
      content: message.content,
    }))

  return [
    ...normalizedHistory,
    { role: 'user', content: lastUserContent },
  ]
}
