// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { CardAction } from '@/components/app/blocks/message-card'

/** サーバーが返したエラーコードを持つ。文言は cardActionErrorMessage で表示言語にする */
export class CardActionError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'CardActionError'
  }
}

/** revision は描いているカードの blocksRevision。サーバーの今のカードと違えば card_changed で断られる */
export async function postCardAction(messageId: string, revision: string, action: CardAction): Promise<void> {
  const res = await fetchWithAuth('/api/app-interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, revision, ...action }),
  })
  if (res.ok) return
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  throw new CardActionError(typeof body?.error === 'string' ? body.error : 'unknown')
}
