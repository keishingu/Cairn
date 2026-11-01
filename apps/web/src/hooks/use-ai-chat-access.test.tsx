// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiChatAllowed } from './use-ai-chat-access'

const { fetchWithAuth } = vi.hoisted(() => ({ fetchWithAuth: vi.fn() }))
vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth }))

function Probe() {
  const allowed = useAiChatAllowed()
  return <span data-testid="allowed">{allowed === undefined ? 'loading' : String(allowed)}</span>
}

function renderAs(wsRole: string, settings: () => Response) {
  fetchWithAuth.mockImplementation(async (input: string) => {
    if (input === '/api/me') return new Response(JSON.stringify({ id: 'user-1', wsRole }))
    if (input === '/api/workspaces/settings') return settings()
    return new Response(JSON.stringify({}))
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <Probe/>
    </QueryClientProvider>,
  )
}

describe('useAiChatAllowed', () => {
  beforeEach(() => fetchWithAuth.mockReset())

  it('「管理者以上」のワークスペースでは、member は使えない', async () => {
    renderAs('member', () => new Response(JSON.stringify({ aiChatAccess: 'admin' })))

    await waitFor(() => expect(screen.getByTestId('allowed')).toHaveTextContent('false'))
  })

  it('「管理者以上」のワークスペースでは、admin は使える', async () => {
    renderAs('admin', () => new Response(JSON.stringify({ aiChatAccess: 'admin' })))

    await waitFor(() => expect(screen.getByTestId('allowed')).toHaveTextContent('true'))
  })

  it('設定を読み込めないときは使えないと決めつけず、サーバーの判定に任せる', async () => {
    renderAs('member', () => new Response(JSON.stringify({ error: 'failed' }), { status: 500 }))

    await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledWith('/api/workspaces/settings'))
    expect(screen.getByTestId('allowed')).toHaveTextContent('loading')
  })
})
