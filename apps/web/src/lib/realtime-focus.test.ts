// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  CONNECTED_FOCUS_REFETCH_AFTER_MS,
  recordQueryFetchSuccess,
  refetchOnWindowFocus,
  setRealtimeFocusCatchUp,
} from './realtime-focus'

const NOW = 1_000_000_000

function setup() {
  const client = new QueryClient()
  let clock = NOW
  client.getQueryCache().subscribe((event) => recordQueryFetchSuccess(event, clock))
  return {
    client,
    setClock: (t: number) => {
      clock = t
    },
    query: (key: string[]) => client.getQueryCache().find({ queryKey: key })!,
  }
}

describe('タブ復帰時の再取得', () => {
  afterEach(() => setRealtimeFocusCatchUp(true))

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
    expect(refetchOnWindowFocus(query(['a']), NOW + CONNECTED_FOCUS_REFETCH_AFTER_MS)).toBe(true)
  })

  it('setQueryData の手動書き込みでは、取り直しまでの時間を延ばさない', async () => {
    const { client, query, setClock } = setup()
    await client.fetchQuery({ queryKey: ['a'], queryFn: () => 1 })
    setClock(NOW + 60_000)
    client.setQueryData(['a'], 2)
    setRealtimeFocusCatchUp(false)
    expect(refetchOnWindowFocus(query(['a']), NOW + CONNECTED_FOCUS_REFETCH_AFTER_MS)).toBe(true)
  })

  it('接続中でも、一度も取得していないクエリは取り直す', () => {
    const { client, query } = setup()
    client.setQueryData(['a'], 1)
    setRealtimeFocusCatchUp(false)
    expect(refetchOnWindowFocus(query(['a']), NOW)).toBe(true)
  })
})
