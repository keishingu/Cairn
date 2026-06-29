// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageCalendar } from './projects-calendar'

vi.mock('@/components/app/mobile/header', () => ({
  MobileHeader: ({ title, right }: { title: string; right?: React.ReactNode }) => (
    <div>
      <div>{title}</div>
      {right}
    </div>
  ),
}))

vi.mock('./create-project-modal', () => ({
  CreateProjectModal: ({ initialStartDate, initialEndDate }: { initialStartDate: string; initialEndDate: string }) => (
    <div data-testid="create-project-modal">
      {initialStartDate} - {initialEndDate}
    </div>
  ),
}))

vi.mock('@/lib/use-workspace-settings', () => ({
  useProjectLabel: () => '予定',
}))

vi.mock('@/lib/command-registry', () => ({
  useCommand: vi.fn(),
}))

const mockFetchWithAuth = vi.fn<(url: string) => Promise<Response>>()

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: (url: string) => mockFetchWithAuth(url),
}))

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <PageCalendar isMobile openPanel={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('PageCalendar (モバイル)', () => {
  beforeEach(() => {
    mockFetchWithAuth.mockReset()
    mockFetchWithAuth.mockImplementation(async (url: string) => {
      if (url === '/api/projects') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      if (url === '/api/projects/statuses') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      if (url === '/api/calendar/google/status') {
        return new Response(JSON.stringify({ connected: false, configured: false }), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
  })

  it('月表示で選択中の空き日をタップすると作成モーダルが開く', async () => {
    const user = userEvent.setup()
    const today = new Date()
    const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日(${['日', '月', '火', '水', '木', '金', '土'][today.getDay()]})`
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    renderPage()

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects')
    })

    await user.click(screen.getByRole('button', { name: todayLabel }))

    expect(await screen.findByTestId('create-project-modal')).toHaveTextContent(`${todayIso} - ${todayIso}`)
  })

  it('週表示の空状態からもその日の作成モーダルを開ける', async () => {
    const user = userEvent.setup()
    const today = new Date()
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    renderPage()

    await user.click(screen.getByRole('button', { name: '週' }))
    await user.click(await screen.findByRole('button', { name: 'この日に新規予定' }))

    expect(await screen.findByTestId('create-project-modal')).toHaveTextContent(`${todayIso} - ${todayIso}`)
  })
})
