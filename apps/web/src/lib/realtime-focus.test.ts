// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from 'vitest'
import {
  CONNECTED_FOCUS_REFETCH_AFTER_MS,
  refetchOnWindowFocus,
  setRealtimeFocusCatchUp,
} from './realtime-focus'

const NOW = 1_000_000_000

function queryUpdatedAgo(ms: number) {
  return { state: { dataUpdatedAt: NOW - ms } }
}

describe('タブ復帰時の再取得', () => {
  afterEach(() => setRealtimeFocusCatchUp(true))

  it('Realtime 切断中は、取得直後でも取り直す', () => {
    setRealtimeFocusCatchUp(true)
    expect(refetchOnWindowFocus(queryUpdatedAgo(0), NOW)).toBe(true)
  })

  it('接続中は、最後の取得から一定時間たつまで取り直さない', () => {
    setRealtimeFocusCatchUp(false)
    expect(refetchOnWindowFocus(queryUpdatedAgo(CONNECTED_FOCUS_REFETCH_AFTER_MS - 1), NOW)).toBe(false)
    expect(refetchOnWindowFocus(queryUpdatedAgo(CONNECTED_FOCUS_REFETCH_AFTER_MS), NOW)).toBe(true)
  })

  it('接続中でも、一度も取得していないクエリは取り直す', () => {
    setRealtimeFocusCatchUp(false)
    expect(refetchOnWindowFocus({ state: { dataUpdatedAt: 0 } }, NOW)).toBe(true)
  })
})
