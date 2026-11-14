// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest'

vi.mock('@cairn/db', () => ({ db: {} }))

describe('チャンネルを時系列で読むカーソル', () => {
  test('同時刻の投稿を区別できるよう日時とIDを往復できる', async () => {
    const { decodeMessageCursor, encodeMessageCursor } = await import('./workspace-research-directory')
    const id = '30000000-0000-4000-8000-000000000001'
    const cursor = encodeMessageCursor('2026-10-27T01:00:00.123456Z', id)
    // マイクロ秒を丸めると、同じ投稿が次のページにも出るため文字列のまま保つ
    expect(decodeMessageCursor(cursor)).toEqual({ createdAt: '2026-10-27T01:00:00.123456Z', id })
  })

  test('壊れたカーソルは解釈せずnullを返す', async () => {
    const { decodeMessageCursor } = await import('./workspace-research-directory')
    expect(decodeMessageCursor('not-a-cursor')).toBeNull()
    expect(decodeMessageCursor('2026-10-27T01:00:00.000000Z_not-uuid')).toBeNull()
    expect(decodeMessageCursor('2026-10-27T01:00:00.000Z_30000000-0000-4000-8000-000000000001')).toBeNull()
    expect(decodeMessageCursor("2026-10-27T01:00:00.000000Z'--_30000000-0000-4000-8000-000000000001")).toBeNull()
    expect(decodeMessageCursor('invalid-date_30000000-0000-4000-8000-000000000001')).toBeNull()
  })
})
