// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RealtimeProvider,
  activeChannelIdFromPathname,
} from './realtime-provider'

const {
  mockUsePathname,
  mockUseCurrentUser,
  mockCreateClient,
} = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
  mockUseCurrentUser: vi.fn(),
  mockCreateClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}))

vi.mock('@/lib/chat/client', () => ({
  chatQueryKeys: {
    projectChannels: ['project-channels'],
    workspaceChannels: ['workspace-channels'],
    dms: ['dms'],
    messages: (channelId: string | null) => ['messages', channelId],
  },
  useCurrentUser: mockUseCurrentUser,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: mockCreateClient,
}))

vi.mock('./realtime-indicator', () => ({
  RealtimeIndicator: () => null,
}))

type ChannelRecord = {
  topic: string
  subscribe: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}

function renderProvider() {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <div>child</div>
      </RealtimeProvider>
    </QueryClientProvider>,
  )
}

describe('activeChannelIdFromPathname', () => {
  it('チャット詳細URLから channelId を取り出す', () => {
    expect(activeChannelIdFromPathname('/chats/channel-1')).toBe('channel-1')
    expect(activeChannelIdFromPathname('/chats/channel-2?m=message-1')).toBe('channel-2')
  })

  it('チャット詳細以外では null を返す', () => {
    expect(activeChannelIdFromPathname('/chats')).toBeNull()
    expect(activeChannelIdFromPathname('/projects')).toBeNull()
  })
})

describe('RealtimeProvider', () => {
  let channels: ChannelRecord[]
  let removeChannel: ReturnType<typeof vi.fn>
  let unsubscribe: ReturnType<typeof vi.fn>

  beforeEach(() => {
    channels = []
    removeChannel = vi.fn().mockResolvedValue(undefined)
    unsubscribe = vi.fn()

    mockUsePathname.mockReturnValue('/chats/channel-active')
    mockUseCurrentUser.mockReturnValue({
      data: { id: 'user-1' },
    })

    mockCreateClient.mockImplementation(() => ({
      channel: (topic: string) => {
        const record: ChannelRecord = {
          topic,
          on: vi.fn().mockReturnThis(),
          subscribe: vi.fn((callback?: (status: string) => void) => {
            callback?.('SUBSCRIBED')
            return record
          }),
        }
        channels.push(record)
        return record
      },
      removeChannel,
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token-1' } } }),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe } },
        })),
      },
      realtime: {
        setAuth: vi.fn().mockResolvedValue(undefined),
      },
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('ユーザートピックとアクティブチャンネルだけを購読する', async () => {
    renderProvider()

    await waitFor(() => {
      expect(channels.map(channel => channel.topic)).toEqual(['user:user-1', 'channel:channel-active'])
    })
  })

  it('チャット詳細URLでないときはユーザートピックだけを購読する', async () => {
    mockUsePathname.mockReturnValue('/projects')

    renderProvider()

    await waitFor(() => {
      expect(channels.map(channel => channel.topic)).toEqual(['user:user-1'])
    })
  })
})
