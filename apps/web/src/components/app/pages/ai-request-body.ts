// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { UIMessage } from 'ai'

export function buildAiRequestBody(messages: UIMessage[], requestBody?: object) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')
  // 添付は ID だけを送る（表示用の experimental_attachments の URL や本体は送らない）
  const attachmentIds = (requestBody as { attachmentIds?: unknown } | undefined)?.attachmentIds
  return {
    messages: latestUserMessage
      ? [{ role: 'user' as const, content: latestUserMessage.content }]
      : [],
    ...(Array.isArray(attachmentIds) && attachmentIds.length > 0 ? { attachmentIds } : {}),
  }
}
