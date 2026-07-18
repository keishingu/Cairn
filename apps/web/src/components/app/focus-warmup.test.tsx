// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FocusWarmup } from './focus-warmup'

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

describe('FocusWarmup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('タブがhidden→visibleに復帰したら/api/warmupを叩く', () => {
    render(<FocusWarmup />)
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetch).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetch).toHaveBeenCalledWith('/api/warmup', expect.objectContaining({ method: 'GET' }))
  })

  it('タブがhiddenの間はwarmupしない', () => {
    render(<FocusWarmup />)
    setVisibility('hidden')
    window.dispatchEvent(new Event('focus'))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('最小間隔内の連続復帰では1回しかwarmupしない', () => {
    render(<FocusWarmup />)
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('focus'))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('最小間隔を超えれば再度warmupする', () => {
    render(<FocusWarmup />)
    window.dispatchEvent(new Event('focus'))
    expect(fetch).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(31 * 1000)
    window.dispatchEvent(new Event('focus'))
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
