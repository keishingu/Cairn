// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { UIMessage } from 'ai'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function buildAiRequestBody(messages: UIMessage[], requestBody?: object) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')
  // 添付は ID だけを送る（表示用の experimental_attachments の URL や本体は送らない）
  const attachmentIds = (requestBody as { attachmentIds?: unknown } | undefined)?.attachmentIds
  return {
    messages: latestUserMessage
      ? [{ role: 'user' as const, content: latestUserMessage.content }]
      : [],
    ...(Array.isArray(attachmentIds) && attachmentIds.length > 0 ? { attachmentIds } : {}),
    // 依頼のメッセージ ID をサーバーでも使わせ、保存されたかを ID で確かめられるようにする。
    // 送信時に決めた UUID だけを送る（AI SDK が自動で付ける ID は UUID ではなく、サーバーは受け付けない）
    ...(latestUserMessage && UUID_RE.test(latestUserMessage.id) ? { messageId: latestUserMessage.id } : {}),
  }
}
