// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver, focusManager } from '@tanstack/react-query'
import {
  CONNECTED_FOCUS_REFETCH_AFTER_MS,
  recordQueryFetchSuccess,
  refetchOnWindowFocus,
  setRealtimeFocusCatchUp,
} from './realtime-focus'

const NOW = 1_000_000_000

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus, retry: false } },
  })
  client.getQueryCache().subscribe((event) => recordQueryFetchSuccess(event))
  const query = (key: string[]) => client.getQueryCache().find({ queryKey: key })!
  return { client, query }
}

describe('タブ復帰時の再取得', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    setRealtimeFocusCatchUp(true)
    vi.useRealTimers()
  })

  it('Realtime 切断中は、取得直後でも取り直す', async () => {
    const { client, query } = setup()
    await client.fetchQuery({ queryKey: ['a'], queryFn: () => 1 })
    setRealtimeFocusCatchUp(true)
    expect(refetchOnWindowFocus(query(['a']), NOW)).toBe(true)
  })

  it('接続中は、最後の取得から一定時間たつまで取り直さない', async () => {
    const { client, query } = setup()
    await client.fetchQuery({ queryKey: ['a'], queryFn: () => 1 })
    setRealtimeFocusCatchUp(false)
    expect(refetchOnWindowFocus(query(['a']), NOW + CONNECTED_FOCUS_REFETCH_AFTER_MS - 1)).toBe(false)
    expect(refetchOnWindowFocus(query(['a']), NOW + CONNECTED_FOCUS_REFETCH_AFTER_MS)).toBe('always')
  })

  it('staleTime が一定時間より長いクエリは、その staleTime まで取り直さない', async () => {
    const { client, query } = setup()
    await client.fetchQuery({ queryKey: ['a'], queryFn: () => 1, staleTime: 15 * 60_000 })
    setRealtimeFocusCatchUp(false)
    expect(refetchOnWindowFocus(query(['a']), NOW + CONNECTED_FOCUS_REFETCH_AFTER_MS)).toBe(false)
    expect(refetchOnWindowFocus(query(['a']), NOW + 15 * 60_000)).toBe('always')
  })

  it('接続中でも、一度も取得していないクエリは staleTime に従って取り直す', () => {
    const { client, query } = setup()
    client.setQueryData(['a'], 1)
    setRealtimeFocusCatchUp(false)
    expect(refetchOnWindowFocus(query(['a']), NOW)).toBe(true)
  })

  it('取得の直前に setQueryData で書き込んでいても、一定時間たった後のタブ復帰で実際に取り直す', async () => {
    const { client } = setup()
    // フォーカスの購読は mount() で始まる
    client.mount()
    const queryFn = vi.fn(() => 1)
    const observer = new QueryObserver(client, { queryKey: ['a'], queryFn })
    const unsubscribe = observer.subscribe(() => {})
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1))
    // QueryCache の通知は notifyManager が次のタイマーで流す
    await vi.advanceTimersByTimeAsync(0)
    setRealtimeFocusCatchUp(false)

    vi.setSystemTime(NOW + CONNECTED_FOCUS_REFETCH_AFTER_MS - 30_000)
    client.setQueryData(['a'], 2)
    vi.setSystemTime(NOW + CONNECTED_FOCUS_REFETCH_AFTER_MS)
    focusManager.setFocused(false)
    focusManager.setFocused(true)

    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
    unsubscribe()
    client.unmount()
    focusManager.setFocused(undefined)
  })
})
