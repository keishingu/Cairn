// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  toast, subscribeToasts, dismissToast, pauseToast, resumeToast, __resetToastsForTest, type ToastItem,
} from './toast'

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

  it('エラーは成功より長く表示される', () => {
    let current: ToastItem[] = []
    subscribeToasts(t => { current = t })

    toast.error('失敗しました')
    vi.advanceTimersByTime(4000)
    expect(current).toHaveLength(1)
    vi.advanceTimersByTime(2000)
    expect(current).toHaveLength(0)
  })

  it('表示中と同じ内容は積まずに表示時間を延ばす', () => {
    let current: ToastItem[] = []
    subscribeToasts(t => { current = t })

    const first = toast.success('コピーしました')
    vi.advanceTimersByTime(3000)
    const second = toast.success('コピーしました')

    expect(second).toBe(first)
    expect(current).toHaveLength(1)
    vi.advanceTimersByTime(3000)
    expect(current).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(current).toHaveLength(0)
  })

  it('同時表示は3件までで古いものから消える', () => {
    let current: ToastItem[] = []
    subscribeToasts(t => { current = t })

    toast.info('1')
    toast.info('2')
    toast.info('3')
    toast.info('4')

    expect(current.map(t => t.message)).toEqual(['2', '3', '4'])
  })

  it('一時停止中は自動で消えず、再開すると残り時間で消える', () => {
    let current: ToastItem[] = []
    subscribeToasts(t => { current = t })

    const id = toast.success('保存しました')
    vi.advanceTimersByTime(1000)
    pauseToast(id)
    vi.advanceTimersByTime(60_000)
    expect(current).toHaveLength(1)

    resumeToast(id)
    vi.advanceTimersByTime(2999)
    expect(current).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(current).toHaveLength(0)
  })
})
