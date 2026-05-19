// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export interface AiClient {
  chat(params: {
    model: string
    systemPrompt: string
    messages: { role: 'user' | 'assistant'; content: string }[]
  }): Promise<string>

  embed(text: string): Promise<number[]>
}
