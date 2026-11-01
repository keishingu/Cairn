// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'
import { claimOneShotRequest } from './one-shot-request'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

describe('一度きりの指示の判定', () => {
  it('同じ open は 1 回だけ実行する', () => {
    const storage = memoryStorage()

    expect(claimOneShotRequest(storage, 'key', 'a')).toBe(true)
    expect(claimOneShotRequest(storage, 'key', 'a')).toBe(false)
  })

  it('open が変われば実行する', () => {
    const storage = memoryStorage()
    claimOneShotRequest(storage, 'key', 'a')

    expect(claimOneShotRequest(storage, 'key', 'b')).toBe(true)
  })

  it('指示の種類ごとに別々に記録する', () => {
    const storage = memoryStorage()
    claimOneShotRequest(storage, 'tasks', 'a')

    expect(claimOneShotRequest(storage, 'ai', 'a')).toBe(true)
  })

  it('open が無ければ記録せず実行する', () => {
    const storage = memoryStorage()

    expect(claimOneShotRequest(storage, 'key', null)).toBe(true)
    expect(claimOneShotRequest(storage, 'key', null)).toBe(true)
  })

  it('記録を読み書きできなくても指示は実行する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: vi.fn(),
    }

    expect(claimOneShotRequest(storage, 'key', 'a')).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
