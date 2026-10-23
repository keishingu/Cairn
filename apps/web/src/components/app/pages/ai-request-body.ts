// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { UIMessage } from 'ai'

export function buildAiRequestBody(messages: UIMessage[]) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')
  return {
    messages: latestUserMessage
      ? [{ role: 'user' as const, content: latestUserMessage.content }]
      : [],
  }
}
