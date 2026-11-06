import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type SubscribeCallback = (status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED', err?: { message?: string }) => void

const { channelRecords, mockCreateClient } = vi.hoisted(() => {
  const channelRecords: Array<{
    topic: string
    callback?: SubscribeCallback
    broadcastCallback?: (message: unknown) => void
  }> = []
  const mockCreateClient = vi.fn(() => ({
    channel: vi.fn((topic: string) => {
      const record: (typeof channelRecords)[number] = { topic }
      channelRecords.push(record)
      const channel = {
        topic,
        on: vi.fn((_type, _filter, callback) => {
          record.broadcastCallback = callback
          return channel
        }),
        subscribe: vi.fn((callback: SubscribeCallback) => {
          record.callback = callback
          return record
        }),
      }
      return channel
    }),
    removeChannel: vi.fn().mockResolvedValue(undefined),
    realtime: { setAuth: vi.fn().mockResolvedValue(undefined) },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }))
  return { channelRecords, mockCreateClient }
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { id: 'user-1', displayName: 'Tester' } }),
}))

vi.mock('@/lib/chat/client', () => ({
  chatQueryKeys: {
    projectChannels: ['project-channels'],
    workspaceChannels: ['workspace-channels'],
    dms: ['dms'],
    messages: (id: string) => ['messages', id],
  },
}))

// チャットを表示している画面の代わり
function OpenChat({ channelId }: { channelId: string }) {
  useRealtimeChannel(channelId)
  return null
}

function renderProvider(openChannelIds: string[] = []) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const tree = (ids: string[]) => (
    <QueryClientProvider client={queryClient}>
      <React.Suspense fallback={null}>
        <RealtimeProvider>
          <div>child</div>
          {ids.map(id => <OpenChat key={id} channelId={id} />)}
        </RealtimeProvider>
      </React.Suspense>
    </QueryClientProvider>
  )
  const result = render(tree(openChannelIds))
  return { ...result, queryClient, setOpenChannels: (ids: string[]) => result.rerender(tree(ids)) }
}

async function connectUserTopic() {
  await act(async () => {
    await Promise.resolve()
  })
  act(() => {
    channelRecords[0]?.callback?.('SUBSCRIBED')
  })
  await act(async () => {
    await Promise.resolve()
  })
}

function removedTopics() {
  return mockCreateClient.mock.results.flatMap(result => {
    const client = result.value as { removeChannel: { mock: { calls: Array<[{ topic?: string }]> } } }
    return client.removeChannel.mock.calls.map(([channel]) => channel?.topic)
  })
}

import { RealtimeProvider } from './realtime-provider'
import { useRealtimeChannel } from './use-realtime-channel'

describe('RealtimeProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    channelRecords.length = 0
    mockCreateClient.mockClear()
  })

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers()
    })
    vi.useRealTimers()
  })

  it('connecting 中は 10 秒経っても再接続バナーを出さない', async () => {
    renderProvider()

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(screen.queryByText('再接続中…')).toBeNull()
  })

  it('CLOSED ではチャンネルを作り直し再接続バナーは出さない', async () => {
    renderProvider()

    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      channelRecords[0]?.callback?.('SUBSCRIBED')
    })
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      channelRecords[0]?.callback?.('CLOSED')
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(channelRecords.length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('再接続中…')).toBeNull()
  })

  it('CHANNEL_ERROR ではチャンネルを作り直さず、10秒切れたら再接続バナーを出す', async () => {
    renderProvider()

    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      channelRecords[0]?.callback?.('SUBSCRIBED')
    })
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      channelRecords[0]?.callback?.('CHANNEL_ERROR', { message: 'boom' })
    })
    act(() => {
      vi.advanceTimersByTime(9_999)
    })
    expect(channelRecords).toHaveLength(1)
    expect(screen.queryByText('再接続中…')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByText('再接続中…')).toBeInTheDocument()

    act(() => {
      channelRecords[0]?.callback?.('SUBSCRIBED')
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(channelRecords).toHaveLength(1)
    expect(screen.queryByText('再接続中…')).toBeNull()
  })

  it('JOIN が TIMED_OUT したあと復帰したら再接続バナーを消す', async () => {
    renderProvider()

    await act(async () => {
      await Promise.resolve()
    })

    expect(channelRecords).toHaveLength(1)

    act(() => {
      channelRecords[0]?.callback?.('TIMED_OUT')
    })

    act(() => {
      vi.advanceTimersByTime(9_999)
    })
    expect(screen.queryByText('再接続中…')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByText('再接続中…')).toBeInTheDocument()
    expect(channelRecords).toHaveLength(1)

    act(() => {
      channelRecords[0]?.callback?.('SUBSCRIBED')
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByText('再接続中…')).toBeNull()
  })

  it('channel_members の broadcast でチャンネル一覧を再取得する', async () => {
    const { queryClient } = renderProvider()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      channelRecords[0]?.callback?.('SUBSCRIBED')
    })
    await act(async () => {
      await Promise.resolve()
    })
    invalidate.mockClear()

    act(() => {
      channelRecords[0]?.broadcastCallback?.({ payload: { table: 'channel_members' } })
    })
    act(() => {
      vi.advanceTimersByTime(800)
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workspace-channels'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project-channels'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dms'] })
  })

  it('channels の削除 broadcast で一覧・タスク・通知を再取得する', async () => {
    const { queryClient } = renderProvider()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      channelRecords[0]?.callback?.('SUBSCRIBED')
    })
    await act(async () => {
      await Promise.resolve()
    })
    invalidate.mockClear()

    act(() => {
      channelRecords[0]?.broadcastCallback?.({ payload: { table: 'channels', operation: 'DELETE' } })
    })
    act(() => {
      vi.advanceTimersByTime(800)
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workspace-channels'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] })
  })

  it('購読は user トピックと表示中のチャットだけで、チャンネル総数に比例しない', async () => {
    renderProvider(['channel-1'])
    await connectUserTopic()

    expect(channelRecords.map(record => record.topic)).toEqual(['user:user-1', 'channel:channel-1'])
  })

  it('表示中のチャットを複数開くとその分だけ購読し、閉じると猶予後に外して古い扱いにする', async () => {
    const { queryClient, setOpenChannels } = renderProvider(['channel-1', 'channel-2'])
    await connectUserTopic()
    expect(channelRecords.map(record => record.topic)).toEqual(['user:user-1', 'channel:channel-1', 'channel:channel-2'])

    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    setOpenChannels(['channel-2'])
    act(() => {
      vi.advanceTimersByTime(4_999)
    })
    expect(removedTopics()).toEqual([])

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(removedTopics()).toEqual(['channel:channel-1'])
    // 購読をやめた後の編集・リアクションは届かないため、次に開いたときに取り直す
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['messages', 'channel-1'], refetchType: 'none' })
  })

  it('猶予中に同じチャットへ戻ったら購読し直さない', async () => {
    const { setOpenChannels } = renderProvider(['channel-1'])
    await connectUserTopic()

    setOpenChannels([])
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    setOpenChannels(['channel-1'])
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(removedTopics()).toEqual([])
    expect(channelRecords.filter(record => record.topic === 'channel:channel-1')).toHaveLength(1)
  })

  it('表示中のチャットの JOIN 完了でそのチャンネルのメッセージを取り直す', async () => {
    const { queryClient } = renderProvider(['channel-1'])
    await connectUserTopic()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const topic = channelRecords.find(record => record.topic === 'channel:channel-1')
    act(() => {
      topic?.callback?.('SUBSCRIBED')
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['messages', 'channel-1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channel-files', 'channel-1'] })
  })

  it('user トピックのメッセージ通知で一覧と画面外チャンネルのメッセージを更新し、届いている表示中のチャットは二重に取らない', async () => {
    const { queryClient } = renderProvider(['open-1'])
    await connectUserTopic()
    act(() => {
      channelRecords.find(record => record.topic === 'channel:open-1')?.callback?.('SUBSCRIBED')
    })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    for (const operation of ['INSERT', 'UPDATE']) {
      invalidate.mockClear()
      act(() => {
        channelRecords[0]?.broadcastCallback?.({
          event: operation,
          payload: { table: 'messages', operation, channel_ids: ['open-1', 'hidden-1'] },
        })
        vi.advanceTimersByTime(800)
      })

      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['messages', 'hidden-1'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channel-files', 'hidden-1'] })
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['messages', 'open-1'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workspace-channels'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects'] })
    }
  })

  it('表示中のチャットが JOIN できていない間は user トピックの通知で再取得する', async () => {
    const { queryClient } = renderProvider(['open-1'])
    await connectUserTopic()
    const topic = channelRecords.find(record => record.topic === 'channel:open-1')
    act(() => {
      topic?.callback?.('SUBSCRIBED')
      topic?.callback?.('CHANNEL_ERROR', { message: 'socket closed' })
    })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    act(() => {
      channelRecords[0]?.broadcastCallback?.({ payload: { table: 'messages', channel_ids: ['open-1'] } })
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['messages', 'open-1'] })
  })

  it('user トピックのタスク通知でタスク一覧と画面外チャンネルの印を更新する', async () => {
    const { queryClient } = renderProvider()
    await connectUserTopic()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    act(() => {
      channelRecords[0]?.broadcastCallback?.({ payload: { table: 'tasks', channel_ids: ['hidden-1'] } })
      channelRecords[0]?.broadcastCallback?.({ payload: { table: 'tasks', channel_ids: ['hidden-2'] } })
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['messages', 'hidden-1'] })
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // 一括操作で続いた通知は1回の再取得にまとめる
    expect(invalidate.mock.calls.filter(([arg]) => JSON.stringify(arg) === JSON.stringify({ queryKey: ['tasks'] }))).toHaveLength(1)
  })

  it('表示中のチャットのタスク broadcast ではそのチャンネルのメッセージを再取得する', async () => {
    const { queryClient } = renderProvider(['channel-1'])
    await connectUserTopic()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const topic = channelRecords.find(record => record.topic === 'channel:channel-1')
    act(() => {
      topic?.broadcastCallback?.({ payload: { table: 'tasks' } })
    })

    // タスク化済みの印（メッセージの linkedTasks）
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['messages', 'channel-1'] })
  })

  it('再接続で切断中の取りこぼしを一括で取り直す', async () => {
    const { queryClient } = renderProvider()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await connectUserTopic()

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['messages'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects'] })
  })

  it('Unauthorized のチャンネル購読は破棄して再JOINしない', async () => {
    renderProvider(['private-1'])

    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      channelRecords[0]?.callback?.('SUBSCRIBED')
    })
    await act(async () => {
      await Promise.resolve()
    })

    const topic = channelRecords.find(record => record.topic === 'channel:private-1')
    act(() => {
      topic?.callback?.('CHANNEL_ERROR', {
        message: 'Unauthorized: You do not have permissions to read from this Channel topic: channel:private-1',
      })
    })
    await act(async () => {
      await Promise.resolve()
    })

    const removed = mockCreateClient.mock.results.some(result => {
      const client = result.value as { removeChannel?: { mock?: { calls: unknown[] } } }
      return (client.removeChannel?.mock?.calls.length ?? 0) > 0
    })
    expect(removed).toBe(true)
  })

  it('JWT 期限切れの Unauthorized ではチャンネル購読を破棄しない', async () => {
    renderProvider(['channel-1'])

    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      channelRecords[0]?.callback?.('SUBSCRIBED')
    })
    await act(async () => {
      await Promise.resolve()
    })

    mockCreateClient.mock.results.forEach(result => {
      const client = result.value as { removeChannel?: { mockClear?: () => void } }
      client.removeChannel?.mockClear?.()
    })

    const topic = channelRecords.find(record => record.topic === 'channel:channel-1')
    act(() => {
      topic?.callback?.('CHANNEL_ERROR', { message: 'Unauthorized: Token has expired' })
    })
    await act(async () => {
      await Promise.resolve()
    })

    const removed = mockCreateClient.mock.results.some(result => {
      const client = result.value as { removeChannel?: { mock?: { calls: unknown[] } } }
      return (client.removeChannel?.mock?.calls.length ?? 0) > 0
    })
    expect(removed).toBe(false)
  })
})
