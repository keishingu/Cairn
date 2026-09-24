import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type SubscribeCallback = (status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED', err?: { message?: string }) => void

const { channelRecords, workspaceChannels, mockCreateClient } = vi.hoisted(() => {
  const channelRecords: Array<{
    topic: string
    callback?: SubscribeCallback
    broadcastCallback?: (message: unknown) => void
  }> = []
  const workspaceChannels: Array<{ id: string }> = []
  const mockCreateClient = vi.fn(() => ({
    channel: vi.fn((topic: string) => {
      const record: (typeof channelRecords)[number] = { topic }
      channelRecords.push(record)
      const channel = {
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
  return { channelRecords, workspaceChannels, mockCreateClient }
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
  useProjectChannels: () => ({ data: [] }),
  useWorkspaceChannels: () => ({ data: workspaceChannels }),
  useWorkspaceDms: () => ({ data: [] }),
}))

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const result = render(
    <QueryClientProvider client={queryClient}>
      <React.Suspense fallback={null}>
        <RealtimeProvider>
          <div>child</div>
        </RealtimeProvider>
      </React.Suspense>
    </QueryClientProvider>,
  )
  return { ...result, queryClient }
}

import { RealtimeProvider } from './realtime-provider'

describe('RealtimeProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    channelRecords.length = 0
    workspaceChannels.length = 0
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

  it('チャンネルのtask broadcastでタスクqueryを再取得する', async () => {
    workspaceChannels.push({ id: 'channel-1' })
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

    const topic = channelRecords.find(record => record.topic === 'channel:channel-1')
    act(() => {
      topic?.broadcastCallback?.({ payload: { table: 'tasks' } })
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks'] })
  })

  it('Unauthorized のチャンネル購読は破棄して再JOINしない', async () => {
    workspaceChannels.push({ id: 'private-1' })
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
    workspaceChannels.push({ id: 'channel-1' })
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
