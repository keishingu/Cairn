// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createActiveChannelRegistry,
  planChannelActivityRefresh,
  realtimePayloadChannelIds,
  realtimePayloadTable,
} from './realtime-channel-activity'

describe('realtimePayloadChannelIds', () => {
  it('user トピックの channel_ids から文字列の ID だけを取り出す', () => {
    expect(realtimePayloadChannelIds({ table: 'messages', channel_ids: ['a', 'b', 1, null, ''] })).toEqual(['a', 'b'])
  })

  it('channel_ids がないペイロード（旧形式・他テーブル）は空にする', () => {
    expect(realtimePayloadChannelIds({ table: 'notifications' })).toEqual([])
    expect(realtimePayloadChannelIds(null)).toEqual([])
  })
})

describe('realtimePayloadTable', () => {
  it('table が文字列のときだけ返す', () => {
    expect(realtimePayloadTable({ table: 'tasks' })).toBe('tasks')
    expect(realtimePayloadTable({ table: 1 })).toBeUndefined()
  })
})

describe('createActiveChannelRegistry', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('表示中のチャンネルだけを返し、チャンネル総数に比例しない', () => {
    const registry = createActiveChannelRegistry(1000)
    registry.acquire('b')
    registry.acquire('a')
    expect(registry.getSnapshot()).toBe('a,b')
  })

  it('最後の画面が離れても猶予のあいだは残し、その後に外す', () => {
    const registry = createActiveChannelRegistry(1000)
    const listener = vi.fn()
    registry.subscribe(listener)
    const release = registry.acquire('a')
    listener.mockClear()

    release()
    expect(registry.getSnapshot()).toBe('a')
    vi.advanceTimersByTime(999)
    expect(registry.getSnapshot()).toBe('a')
    vi.advanceTimersByTime(1)
    expect(registry.getSnapshot()).toBe('')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('猶予中に再表示されたら購読を外さない', () => {
    const registry = createActiveChannelRegistry(1000)
    registry.acquire('a')()
    vi.advanceTimersByTime(500)
    registry.acquire('a')
    vi.advanceTimersByTime(5000)
    expect(registry.getSnapshot()).toBe('a')
  })

  it('同じチャンネルを2画面で表示しているときは両方離れるまで残す', () => {
    const registry = createActiveChannelRegistry(0)
    const releaseFirst = registry.acquire('a')
    const releaseSecond = registry.acquire('a')
    releaseFirst()
    vi.runAllTimers()
    expect(registry.getSnapshot()).toBe('a')
    releaseSecond()
    vi.runAllTimers()
    expect(registry.getSnapshot()).toBe('')
  })

  it('同じ release を2回呼んでも別画面の分を減らさない', () => {
    const registry = createActiveChannelRegistry(0)
    const release = registry.acquire('a')
    registry.acquire('a')
    release()
    release()
    vi.runAllTimers()
    expect(registry.getSnapshot()).toBe('a')
  })
})

describe('planChannelActivityRefresh', () => {
  it('メッセージ通知は一覧と、channel トピックが届いていないチャンネルのメッセージ・ファイルを取り直す', () => {
    expect(planChannelActivityRefresh(
      { table: 'messages', operation: 'UPDATE', channel_ids: ['open', 'hidden'] },
      new Set(['open']),
    )).toEqual({ channelLists: true, tasks: false, messageChannelIds: ['hidden'], fileChannelIds: ['hidden'] })
  })

  it('タスク通知はタスク一覧と、届いていないチャンネルのメッセージ（タスク化の印）を取り直す', () => {
    expect(planChannelActivityRefresh(
      { table: 'tasks', operation: 'DELETE', channel_ids: ['hidden'] },
      new Set(),
    )).toEqual({ channelLists: false, tasks: true, messageChannelIds: ['hidden'], fileChannelIds: [] })
  })

  it('チャンネル活動以外の通知は扱わない', () => {
    expect(planChannelActivityRefresh({ table: 'notifications' }, new Set())).toBeNull()
  })
})
