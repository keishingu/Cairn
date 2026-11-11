// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BROADCAST_COVERED_QUERY_KEYS, FOCUS_REFETCH_EXEMPT_ROOTS } from './realtime-coverage'
import { refetchOnWindowFocus, setRealtimeFocusCatchUp } from './realtime-focus'

// 行の Broadcast だけでは足りないもの。ギャラリーは gallery_items、参加者一覧は別クエリ。
const NOT_COVERED_ROOTS = [
  'project-gallery',
  'channel-members',
  'bookmarks',
  'workspace',
  'workspace-members',
  'pinned-projects',
  'me',
] as const

describe('フォーカス時の再取得', () => {
  it('接続中に止めるのは、書き込みがすべて Broadcast されるキーだけ', () => {
    setRealtimeFocusCatchUp(false)
    for (const root of FOCUS_REFETCH_EXEMPT_ROOTS) {
      expect(refetchOnWindowFocus({ queryKey: [root, 'child'] })).toBe(false)
    }
    for (const root of NOT_COVERED_ROOTS) {
      expect(refetchOnWindowFocus({ queryKey: [root] })).toBe(true)
    }

    setRealtimeFocusCatchUp(true)
    expect(refetchOnWindowFocus({ queryKey: ['messages', 'channel-1'] })).toBe(true)
    expect(refetchOnWindowFocus({ queryKey: ['files', 'list'] })).toBe(true)
    expect(refetchOnWindowFocus({ queryKey: ['tasks'] })).toBe(true)
  })

  it('免除キーは realtime-provider が同じ定数で invalidate する', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/realtime/realtime-provider.tsx'),
      'utf8',
    )
    const viaHelper: Record<string, string> = {
      messages: 'coveredMessagesQueryKey(',
      channelFiles: 'coveredChannelFilesQueryKey(',
    }
    for (const name of Object.keys(BROADCAST_COVERED_QUERY_KEYS)) {
      const needle = viaHelper[name] ?? `BROADCAST_COVERED_QUERY_KEYS.${name}`
      expect(source).toContain(needle)
    }
    for (const root of NOT_COVERED_ROOTS) {
      expect(FOCUS_REFETCH_EXEMPT_ROOTS).not.toContain(root)
    }
  })
})
