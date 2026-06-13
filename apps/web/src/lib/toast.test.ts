// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast, subscribeToasts, dismissToast, __resetToastsForTest, type ToastItem } from './toast'

describe('toast ストア', () => {
  beforeEach(() => {
    __resetToastsForTest()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('購読すると現在のリストが即時に1回通知される', () => {
    const received: ToastItem[][] = []
    subscribeToasts(t => received.push(t))
    expect(received).toHaveLength(1)
    expect(received[0]).toEqual([])
  })

  it('success / error / info でバリアントを指定して追加できる', () => {
    let current: ToastItem[] = []
    subscribeToasts(t => { current = t })

    toast.success('保存しました')
    toast.error('失敗しました')
    toast.info('お知らせ')

    expect(current.map(t => ({ message: t.message, variant: t.variant }))).toEqual([
      { message: '保存しました', variant: 'success' },
      { message: '失敗しました', variant: 'error' },
      { message: 'お知らせ', variant: 'info' },
    ])
  })

  it('デフォルトの表示時間が経過すると自動で消える', () => {
    let current: ToastItem[] = []
    subscribeToasts(t => { current = t })

    toast.success('保存しました')
    expect(current).toHaveLength(1)

    vi.advanceTimersByTime(4000)
    expect(current).toHaveLength(0)
  })

  it('duration: 0 を渡すと自動消去されない', () => {
    let current: ToastItem[] = []
    subscribeToasts(t => { current = t })

    toast.error('恒久エラー', { duration: 0 })
    vi.advanceTimersByTime(60_000)
    expect(current).toHaveLength(1)
  })

  it('id を指定して任意のタイミングで閉じられる', () => {
    let current: ToastItem[] = []
    subscribeToasts(t => { current = t })

    const id = toast.info('処理中', { duration: 0 })
    expect(current).toHaveLength(1)

    dismissToast(id)
    expect(current).toHaveLength(0)
  })

  it('解除した購読者には以後通知されない', () => {
    let count = 0
    const unsubscribe = subscribeToasts(() => { count++ })
    expect(count).toBe(1) // 初回通知
    unsubscribe()
    toast.success('保存しました')
    expect(count).toBe(1)
  })
})
