// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest'
import { prepareMessageBlocks } from '@cairn/shared'

vi.mock('@cairn/db', () => ({ db: {}, APP_SCOPES: ['chat:write', 'users:read', 'channels:read'] }))

describe('承認後に Cairn AI が投稿するカード', () => {
  test('本文と承認者の補足をアプリ基盤が受理できるカードにする', async () => {
    const { approvedPostBlocks } = await import('./pending-action-executor')
    const blocks = approvedPostBlocks('<@00000000-0000-4000-8000-000000000003> レビューをお願いします', '佐藤 花子', 'ja')
    expect(prepareMessageBlocks(blocks)).toMatchObject({ ok: true })
    expect(blocks).toEqual([
      { type: 'markdown', text: '<@00000000-0000-4000-8000-000000000003> レビューをお願いします' },
      { type: 'context', elements: [{ type: 'plain_text', text: '佐藤 花子さんが承認' }] },
    ])
  })
})
