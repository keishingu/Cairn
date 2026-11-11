// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { refetchOnWindowFocus, setRealtimeFocusCatchUp } from './realtime-focus'

describe('フォーカス時の再取得', () => {
  it('Realtime が更新するクエリだけ、接続中の再取得を止める', () => {
    setRealtimeFocusCatchUp(false)
    expect(refetchOnWindowFocus({ queryKey: ['messages', 'channel-1'] })).toBe(false)
    expect(refetchOnWindowFocus({ queryKey: ['notifications', 'badge-count'] })).toBe(false)
    expect(refetchOnWindowFocus({ queryKey: ['files', 'list', ''] })).toBe(true)
    expect(refetchOnWindowFocus({ queryKey: ['files', 'facets', ''] })).toBe(true)
    expect(refetchOnWindowFocus({ queryKey: ['project-files', 'p1'] })).toBe(true)
    expect(refetchOnWindowFocus({ queryKey: ['tasks'] })).toBe(true)
    expect(refetchOnWindowFocus({ queryKey: ['tasks', 'detail', 't1'] })).toBe(true)

    setRealtimeFocusCatchUp(true)
    expect(refetchOnWindowFocus({ queryKey: ['messages', 'channel-1'] })).toBe(true)
    expect(refetchOnWindowFocus({ queryKey: ['files', 'list', ''] })).toBe(true)
  })
})
