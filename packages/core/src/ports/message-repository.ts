// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { Message } from '../domain/index.js'
import type { PostMessageInput } from '@cairn/shared'

export interface MessageRepository {
  findByChannelId(channelId: string, limit?: number, before?: Date): Promise<Message[]>
  post(input: PostMessageInput & { senderId: string }): Promise<Message>
  softDelete(messageId: string): Promise<void>
}
