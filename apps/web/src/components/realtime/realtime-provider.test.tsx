// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RealtimeProvider, useRealtime } from './realtime-provider'

const {
  channelMock,
  createClientMock,
  removeChannelMock,
  setAuthMock,
  getSessionMock,
  onAuthStateChangeMock,
  useCurrentUserMock,
  useProjectChannelsMock,
  useWorkspaceChannelsMock,
  useWorkspaceDmsMock,
  usePathnameMock,
  indicatorMock,
} = vi.hoisted(() => {
  const channelMock = vi.fn()
  const removeChannelMock = vi.fn().mockResolvedValue(undefined)
  const setAuthMock = vi.fn().mockResolvedValue(undefined)
  const getSessionMock = vi.fn().mockResolvedValue({ data: { session: { access_token: 'token-1' } } })
  const onAuthStateChangeMock = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
  const createClientMock = vi.fn(() => ({
    channel: channelMock,
    removeChannel: removeChannelMock,
    realtime: { setAuth: setAuthMock },
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
  }))
  return {
    channelMock,
    createClientMock,
    removeChannelMock,
    setAuthMock,
    getSessionMock,
    onAuthStateChangeMock,
    useCurrentUserMock: vi.fn(),
    useProjectChannelsMock: vi.fn(),
    useWorkspaceChannelsMock: vi.fn(),
    useWorkspaceDmsMock: vi.fn(),
    usePathnameMock: vi.fn(),
    indicatorMock: vi.fn(() => null),
  }
})

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/chat/client', () => ({
  chatQueryKeys: {
    projectChannels: ['project-channels'],
    workspaceChannels: ['workspace-channels'],
    dms: ['dms'],
    messages: (channelId: string | null) => ['messages', channelId],
  },
  useCurrentUser: useCurrentUserMock,
  useProjectChannels: useProjectChannelsMock,
  useWorkspaceChannels: useWorkspaceChannelsMock,
  useWorkspaceDms: useWorkspaceDmsMock,
}))

vi.mock('./realtime-indicator', () => ({
  RealtimeIndicator: indicatorMock,
}))

function VisibleChannelProbe({ channelId }: { channelId: string }) {
  const { registerVisibleChannel } = useRealtime()

  React.useEffect(() => registerVisibleChannel(channelId), [channelId, registerVisibleChannel])

  return null
}

function renderRealtime(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>{children}</RealtimeProvider>
    </QueryClientProvider>,
  )
}

describe('RealtimeProvider', () => {
  beforeEach(() => {
    channelMock.mockReset()
    createClientMock.mockClear()
    removeChannelMock.mockClear()
    setAuthMock.mockClear()
    getSessionMock.mockClear()
    onAuthStateChangeMock.mockClear()
    indicatorMock.mockClear()

    useCurrentUserMock.mockReturnValue({
      data: { id: 'user-1' },
    })
    useProjectChannelsMock.mockReturnValue({
      data: [{ channelId: 'project-channel-1' }],
      isFetched: true,
    })
    useWorkspaceChannelsMock.mockReturnValue({
      data: [],
      isFetched: true,
    })
    useWorkspaceDmsMock.mockReturnValue({
      data: [],
      isFetched: true,
    })
    usePathnameMock.mockReturnValue('/projects')

    channelMock.mockImplementation((topic: string) => {
      const api = {
        topic,
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn((callback?: (status: string, err?: { message?: string }) => void) => {
          if (topic === 'user:user-1') callback?.('SUBSCRIBED')
          return api
        }),
      }
      return api
    })
  })

  it('project panel の ChatThread でも channel topic を購読する', async () => {
    renderRealtime(<VisibleChannelProbe channelId="project-channel-1" />)

    await waitFor(() => {
      expect(channelMock).toHaveBeenCalledWith('channel:project-channel-1', { config: { private: true } })
    })
  })

  it('アクセス不能な visible channel は購読しない', async () => {
    renderRealtime(<VisibleChannelProbe channelId="project-channel-2" />)

    await waitFor(() => {
      expect(channelMock).toHaveBeenCalledWith('user:user-1', { config: { private: true } })
    })

    expect(channelMock).not.toHaveBeenCalledWith('channel:project-channel-2', { config: { private: true } })
  })
})
