// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { AiClient } from '../ports/index.js'

export class GenerateAiReplyUseCase {
  constructor(private readonly aiClient: AiClient) {}

  async execute(params: {
    model: string
    systemPrompt: string
    messages: { role: 'user' | 'assistant'; content: string }[]
  }): Promise<string> {
    return this.aiClient.chat(params)
  }
}
