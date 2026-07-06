import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKSPACE_COOKIE } from '@/lib/workspace-cookie'

type SubscribeCallback = (status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED', err?: { message?: string }) => void

const {
  channelRecords,
  mockCreateClient,
  mockRemoveAllChannels,
} = vi.hoisted(() => {
  const channelRecords: Array<{
    topic: string
    callback?: SubscribeCallback
    handlers: Record<string, ((payload?: unknown) => void)[]>
  }> = []
  const mockRemoveAllChannels = vi.fn().mockResolvedValue([])
  const mockCreateClient = vi.fn(() => ({
    channel: vi.fn((topic: string) => {
      const record: {
        topic: string
        callback?: SubscribeCallback
        handlers: Record<string, ((payload?: unknown) => void)[]>
      } = { topic, handlers: {} }
      channelRecords.push(record)
      const channel = {
        on: vi.fn((type: string, filter: { event: string }, callback: (payload?: unknown) => void) => {
          const key = `${type}:${filter.event}`
          record.handlers[key] ??= []
          record.handlers[key]?.push(callback)
          return channel
        }),
        subscribe: vi.fn((callback: SubscribeCallback) => {
          record.callback = callback
          return record
        }),
      }
      return {
        ...channel,
      }
    }),
    removeChannel: vi.fn().mockResolvedValue(undefined),
    removeAllChannels: mockRemoveAllChannels,
    realtime: { setAuth: vi.fn().mockResolvedValue(undefined) },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }))
  return { channelRecords, mockCreateClient, mockRemoveAllChannels }
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/lib/chat/client', () => ({
  chatQueryKeys: {
    projectChannels: ['project-channels'],
    workspaceChannels: ['workspace-channels'],
    dms: ['dms'],
    messages: (id: string) => ['messages', id],
  },
  useCurrentUser: () => ({ data: { id: 'user-1', workspaceId: 'ws-1', displayName: 'Tester' } }),
  useProjectChannels: () => ({ data: [] }),
  useWorkspaceChannels: () => ({ data: [] }),
  useWorkspaceDms: () => ({ data: [] }),
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
    mockRemoveAllChannels.mockClear()
    document.cookie = `${WORKSPACE_COOKIE}=; path=/; SameSite=Lax; Max-Age=0`
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

  it('membership-revoked を受けたら全 channel を外して対象ワークスペースの cookie を捨てて reload する', async () => {
    const reloadSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy })
    document.cookie = `${WORKSPACE_COOKIE}=ws-1; path=/; SameSite=Lax`
    renderProvider()

    await act(async () => {
      await Promise.resolve()
    })

    const revokedHandlers = channelRecords[0]?.handlers['broadcast:membership-revoked'] ?? []
    expect(revokedHandlers).toHaveLength(1)

    await act(async () => {
      revokedHandlers[0]?.()
      await Promise.resolve()
    })

    expect(mockRemoveAllChannels).toHaveBeenCalledTimes(1)
    expect(reloadSpy).toHaveBeenCalledTimes(1)
    expect(document.cookie).not.toContain(`${WORKSPACE_COOKIE}=`)
    vi.unstubAllGlobals()
  })

  it('membership-revoked でも別 workspace の cookie は残す', async () => {
    const reloadSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy })
    document.cookie = `${WORKSPACE_COOKIE}=ws-2; path=/; SameSite=Lax`
    renderProvider()

    await act(async () => {
      await Promise.resolve()
    })

    const revokedHandlers = channelRecords[0]?.handlers['broadcast:membership-revoked'] ?? []
    expect(revokedHandlers).toHaveLength(1)

    await act(async () => {
      revokedHandlers[0]?.()
      await Promise.resolve()
    })

    expect(document.cookie).toContain(`${WORKSPACE_COOKIE}=ws-2`)
    vi.unstubAllGlobals()
  })
})
