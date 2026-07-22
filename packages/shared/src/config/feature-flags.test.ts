// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { enabledInProduction, enabledOutsideProduction } from './feature-flags'

describe('環境別feature flag', () => {
  it('Productionでは無効になる', () => {
    expect(enabledOutsideProduction('production')).toBe(false)
  })

  it('Production以外では有効になる', () => {
    expect(enabledOutsideProduction('preview')).toBe(true)
    expect(enabledOutsideProduction('development')).toBe(true)
    expect(enabledOutsideProduction(undefined)).toBe(true)
  })

  it('Production限定フラグはProductionだけで有効になる', () => {
    expect(enabledInProduction('production')).toBe(true)
    expect(enabledInProduction('preview')).toBe(false)
    expect(enabledInProduction('development')).toBe(false)
    expect(enabledInProduction(undefined)).toBe(false)
  })
})
