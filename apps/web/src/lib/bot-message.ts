// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { MessageCreatedEvent } from '@/lib/inngest/events'
import { inngest } from '@/lib/inngest/client'
import { ensureWorkspaceBotProfile } from './bot-profile'

type PostBotMessageArgs = {
  channelId: string
  workspaceId: string
  content: string
  messageType?: 'text' | 'html' | 'system'
}

export async function postBotMessage({
  channelId,
  workspaceId,
  content,
  messageType = 'text',
}: PostBotMessageArgs): Promise<{ id: string; senderId: string; senderName: string }> {
  const { db } = await import('@cairn/db')
  const { messages } = await import('@cairn/db')

  const bot = await ensureWorkspaceBotProfile(workspaceId)

  const [inserted] = await db
    .insert(messages)
    .values({
      channelId,
      senderId: bot.id,
      content,
      messageType,
      parentMessageId: null,
    })
    .returning({
      id: messages.id,
      senderId: messages.senderId,
    })

  if (!inserted) throw new Error('Bot message insert failed')

  inngest
    .send({
      name: 'message/created',
      data: {
        messageId: inserted.id,
        channelId,
        workspaceId,
        senderId: bot.id,
        senderName: bot.displayName,
        content,
        attachmentFileIds: [],
      },
    } satisfies MessageCreatedEvent)
    .catch((err: unknown) => {
      console.warn('[inngest] bot message/created send failed (Inngest not running?):', err)
    })

  return {
    id: inserted.id,
    senderId: inserted.senderId,
    senderName: bot.displayName,
  }
}
