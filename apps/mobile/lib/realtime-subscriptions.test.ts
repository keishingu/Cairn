// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest'
import { reconcileRealtimeSubscriptions } from './realtime-subscriptions'

describe('Realtimeの差分購読', () => {
  it('同じチャンネル一覧の更新では既存の購読を維持し、差分だけ変更する', () => {
    const current = new Map<string, { id: string }>()
    const subscribe = vi.fn((id: string) => ({ id }))
    const remove = vi.fn()
    reconcileRealtimeSubscriptions(current, new Set(['a', 'b']), subscribe, remove)
    const originalB = current.get('b')
    reconcileRealtimeSubscriptions(current, new Set(['a', 'b']), subscribe, remove)
    expect(subscribe).toHaveBeenCalledTimes(2)
    expect(remove).not.toHaveBeenCalled()
    reconcileRealtimeSubscriptions(current, new Set(['b', 'c']), subscribe, remove)
    expect(current.get('b')).toBe(originalB)
    expect([...current.keys()]).toEqual(['b', 'c'])
    expect(subscribe).toHaveBeenCalledTimes(3)
    expect(remove).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith({ id: 'a' })
  })

  it('認証解除時はすべてを解除する', () => {
    const current = new Map([['a', 'subscription']])
    const remove = vi.fn()
    reconcileRealtimeSubscriptions(current, new Set(), vi.fn(), remove)
    expect(current.size).toBe(0)
    expect(remove).toHaveBeenCalledWith('subscription')
  })

  it('同期的な購読失敗で削除された購読を再登録しない', () => {
    const current = new Map<string, string>()
    const start = vi.fn((_subscription: string, id: string) => { current.delete(id) })
    reconcileRealtimeSubscriptions(current, new Set(['a']), id => id, vi.fn(), start)
    expect(start).toHaveBeenCalledOnce()
    expect(current.size).toBe(0)
  })

})
