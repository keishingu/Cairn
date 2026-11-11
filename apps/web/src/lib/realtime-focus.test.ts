// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { refetchOnWindowFocusWhenRealtimeDown, setRealtimeFocusCatchUp } from './realtime-focus'

describe('フォーカス時の再取得', () => {
  it('Realtime 接続中は再取得せず、切断中だけ再取得する', () => {
    setRealtimeFocusCatchUp(false)
    expect(refetchOnWindowFocusWhenRealtimeDown()).toBe(false)
    setRealtimeFocusCatchUp(true)
    expect(refetchOnWindowFocusWhenRealtimeDown()).toBe(true)
  })
})
