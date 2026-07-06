import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type SubscribeCallback = (status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED', err?: { message?: string }) => void

const { channelRecords, mockCreateClient } = vi.hoisted(() => {
  const channelRecords: Array<{ topic: string; callback?: SubscribeCallback }> = []
  const mockCreateClient = vi.fn(() => ({
    channel: vi.fn((topic: string) => {
      const record: { topic: string; callback?: SubscribeCallback } = { topic }
      channelRecords.push(record)
      return {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn((callback: SubscribeCallback) => {
          record.callback = callback
          return record
        }),
      }
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

const mockUsePathname = vi.fn(() => '/chats/channel-1')
const mockUseProjectChannels = vi.fn(() => ({ data: [{ channelId: 'channel-1' }], isFetched: true }))
const mockUseWorkspaceChannels = vi.fn(() => ({ data: [], isFetched: true }))
const mockUseWorkspaceDms = vi.fn(() => ({ data: [], isFetched: true }))

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

vi.mock('@/lib/chat/client', () => ({
  chatQueryKeys: {
    projectChannels: ['project-channels'],
    workspaceChannels: ['workspace-channels'],
    dms: ['dms'],
    messages: (id: string) => ['messages', id],
  },
  useCurrentUser: () => ({ data: { id: 'user-1', displayName: 'Tester' } }),
  useProjectChannels: () => mockUseProjectChannels(),
  useWorkspaceChannels: () => mockUseWorkspaceChannels(),
  useWorkspaceDms: () => mockUseWorkspaceDms(),
}))

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <React.Suspense fallback={null}>
        <RealtimeProvider>
          <div>child</div>
        </RealtimeProvider>
      </React.Suspense>
    </QueryClientProvider>,
  )
}

import { RealtimeProvider } from './realtime-provider'

describe('RealtimeProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    channelRecords.length = 0
    mockCreateClient.mockClear()
    mockUsePathname.mockReturnValue('/chats/channel-1')
    mockUseProjectChannels.mockReturnValue({ data: [{ channelId: 'channel-1' }], isFetched: true })
    mockUseWorkspaceChannels.mockReturnValue({ data: [], isFetched: true })
    mockUseWorkspaceDms.mockReturnValue({ data: [], isFetched: true })
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

  it('接続後は user topic と現在開いている channel topic だけを購読する', async () => {
    renderProvider()

    await act(async () => {
      await Promise.resolve()
    })

    expect(channelRecords).toHaveLength(1)
    expect(channelRecords[0]?.topic).toBe('user:user-1')

    act(() => {
      channelRecords[0]?.callback?.('SUBSCRIBED')
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(channelRecords).toHaveLength(2)
    expect(channelRecords[1]?.topic).toBe('channel:channel-1')
  })

  it('購読失敗後に再試行し、復帰したら再接続バナーを消す', async () => {
    renderProvider()

    await act(async () => {
      await Promise.resolve()
    })

    expect(channelRecords).toHaveLength(1)

    act(() => {
      channelRecords[0]?.callback?.('CHANNEL_ERROR', { message: 'boom' })
    })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      vi.advanceTimersByTime(9_999)
    })
    expect(screen.queryByText('再接続中…')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByText('再接続中…')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(3_000)
      await Promise.resolve()
    })

    expect(channelRecords).toHaveLength(2)

    act(() => {
      channelRecords[1]?.callback?.('SUBSCRIBED')
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByText('再接続中…')).toBeNull()
  })

  it('古い user channel の CLOSED を再接続後の channel に波及させない', async () => {
    renderProvider()

    await act(async () => {
      await Promise.resolve()
    })

    expect(channelRecords).toHaveLength(1)
    const staleChannel = channelRecords[0]

    act(() => {
      staleChannel?.callback?.('CHANNEL_ERROR', { message: 'boom' })
    })

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      vi.advanceTimersByTime(3_000)
      await Promise.resolve()
    })

    expect(channelRecords).toHaveLength(2)

    act(() => {
      staleChannel?.callback?.('CLOSED')
    })

    await act(async () => {
      await Promise.resolve()
      vi.advanceTimersByTime(3_000)
      await Promise.resolve()
    })

    expect(channelRecords).toHaveLength(2)
  })

  it('可視一覧にない channelId では topic を購読しない', async () => {
    mockUsePathname.mockReturnValue('/chats/forbidden-channel')
    mockUseProjectChannels.mockReturnValue({ data: [{ channelId: 'channel-1' }], isFetched: true })

    renderProvider()

    await act(async () => {
      await Promise.resolve()
    })

    expect(channelRecords).toHaveLength(1)

    act(() => {
      channelRecords[0]?.callback?.('SUBSCRIBED')
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(channelRecords).toHaveLength(1)
    expect(channelRecords[0]?.topic).toBe('user:user-1')
  })
})
