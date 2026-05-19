// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { PostMessageInput } from '@cairn/shared'
import type { Message } from '../domain/index.js'
import type { MessageRepository } from '../ports/index.js'

export class PostMessageUseCase {
  constructor(private readonly messageRepo: MessageRepository) {}

  async execute(input: PostMessageInput & { senderId: string }): Promise<Message> {
    return this.messageRepo.post(input)
  }
}
