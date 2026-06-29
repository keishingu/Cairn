// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { CoreMessage } from 'ai'
import { z } from 'zod'

const MAX_CLIENT_MESSAGES = 50
const MAX_HISTORY_MESSAGES = 40
const MAX_MESSAGE_CHARS = 4000

const aiRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().max(MAX_MESSAGE_CHARS),
    }).passthrough(),
  ).min(1).max(MAX_CLIENT_MESSAGES),
})

export interface StoredConversationMessage {
  role: string
  content: string
}

export function parseLatestUserInput(body: unknown): { lastUserContent: string; clientMessageCount: number } {
  const parsed = aiRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new Error('messages は user/assistant の文字列メッセージを 1〜50 件で指定してください')
  }

  const lastMessage = parsed.data.messages.at(-1)
  if (!lastMessage || lastMessage.role !== 'user') {
    throw new Error('最後のメッセージは user である必要があります')
  }

  const lastUserContent = lastMessage.content.trim()
  if (!lastUserContent) {
    throw new Error('ユーザーメッセージが空です')
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
