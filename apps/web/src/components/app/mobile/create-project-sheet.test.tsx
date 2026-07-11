// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateProjectSheet } from './create-project-sheet'

vi.mock('../location-input', () => ({
  LocationInput: ({ value, onClear }: { value: string; onClear: () => void }) => (
    <div>
      <input aria-label="場所" value={value} readOnly />
      <button type="button" onClick={onClear}>場所クリア</button>
    </div>
  ),
}))

const mockFetchWithAuth = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>()

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: (input: string, init?: RequestInit) => mockFetchWithAuth(input, init),
}))

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

describe('CreateProjectSheet', () => {
  beforeEach(() => {
    mockFetchWithAuth.mockReset()
    mockFetchWithAuth.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/projects/statuses') {
        return new Response(JSON.stringify([
          { id: 'status-inbox', name: 'Inbox', color: '#111111' },
        ]), { status: 200 })
      }

      if (input === '/api/workspaces/members?status=active') {
        return new Response(JSON.stringify([]), { status: 200 })
      }

      if (input === '/api/projects' && init?.method === 'POST') {
        return new Response(JSON.stringify({
          id: 'project-1',
          title: '新規予定',
          description: null,
          statusName: 'Inbox',
          statusColor: '#111111',
          startDate: null,
          endDate: null,
          memberCount: 0,
          memberNames: [],
          memberAvatarUrls: [],
          taskCount: 0,
          completedTaskCount: 0,
          isOwner: true,
          isMember: false,
          archived: false,
          coverPhotoIdx: 0,
          coverPhotoUrl: null,
          location: null,
          placeId: null,
        }), { status: 200 })
      }

      throw new Error(`Unexpected fetch: ${input}`)
    })
  })

  it('モバイル作成時に先頭ステータスの statusId を送る', async () => {
    const user = userEvent.setup()
    const queryClient = makeQueryClient()
    const onCreated = vi.fn()

    render(
      <QueryClientProvider client={queryClient}>
        <CreateProjectSheet onClose={() => {}} onCreated={onCreated} />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects/statuses', undefined)
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/workspaces/members?status=active', undefined)
    })

    await user.type(screen.getByPlaceholderText('例: 新規顧客向け導入プロジェクト'), '新規予定')
    await user.click(screen.getByRole('button', { name: '作成する' }))

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'project-1' }))
    })

    const postCall = mockFetchWithAuth.mock.calls.find(([input, init]) => input === '/api/projects' && init?.method === 'POST')
    expect(postCall).toBeTruthy()
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      title: '新規予定',
      statusId: 'status-inbox',
    })
  })

  it('ステータス取得前は送信できない', async () => {
    const user = userEvent.setup()
    const queryClient = makeQueryClient()
    const onCreated = vi.fn()

    let resolveStatuses: ((value: Response) => void) | null = null
    mockFetchWithAuth.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/statuses') {
        return new Promise<Response>((resolve) => {
          resolveStatuses = resolve
        })
      }

      if (input === '/api/workspaces/members?status=active') {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }

      if (input === '/api/projects' && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ id: 'project-1' }), { status: 200 }))
      }

      throw new Error(`Unexpected fetch: ${input}`)
    })

    render(
      <QueryClientProvider client={queryClient}>
        <CreateProjectSheet onClose={() => {}} onCreated={onCreated} />
      </QueryClientProvider>,
    )

    await user.type(screen.getByPlaceholderText('例: 新規顧客向け導入プロジェクト'), '新規予定')
    expect(screen.getByRole('button', { name: '作成する' })).toBeDisabled()

    resolveStatuses?.(new Response(JSON.stringify([
      { id: 'status-inbox', name: 'Inbox', color: '#111111' },
    ]), { status: 200 }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '作成する' })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: '作成する' }))

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled()
    })
  })
})
