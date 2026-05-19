// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { MessageType } from '@cairn/shared'

export type Message = {
  id: string
  channelId: string
  parentMessageId: string | null
  senderId: string
  messageType: MessageType
  content: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}
