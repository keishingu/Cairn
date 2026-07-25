// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { shouldRefreshContributionsAfterError } from './credit-placement-board'

describe('shouldRefreshContributionsAfterError', () => {
  it('同じ付与を別のメンバーが先に配置した競合ではキューを再取得する', () => {
    expect(shouldRefreshContributionsAfterError(409)).toBe(true)
  })

  it('競合以外の保存失敗ではキューを再取得しない', () => {
    expect(shouldRefreshContributionsAfterError(400)).toBe(false)
    expect(shouldRefreshContributionsAfterError(500)).toBe(false)
  })
})
