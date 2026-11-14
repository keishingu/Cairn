// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './feature-flags'

describe('feature flag', () => {
  it('DMとAI PMOを全環境で利用可能にする', () => {
    expect(FEATURE_FLAGS).toEqual({ dm: true, aiPmo: true })
  })
})
