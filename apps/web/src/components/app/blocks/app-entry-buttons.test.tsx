// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))
vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth: mockFetch }))

import { AppEntryButtons } from './app-entry-buttons'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const app = (inChannel: boolean) => [{ installationId: 'i1', appName: '投票', appIconUrl: null, inChannel, entryPoints: [{ command: '/poll', label: 'Create a poll' }] }]

function renderButtons(onError = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AppEntryButtons channelId="c1" onError={onError} />
    </QueryClientProvider>,
  )
  return onError
}

describe('アプリの起動口', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('Bot がいるチャンネルでは、選ぶとそのまま起動口をアプリへ送る', async () => {
    mockFetch.mockImplementation(async (url: string) => (url.endsWith('/app-entry-points') ? json(app(true)) : json({ ok: true })))
    renderButtons()
    fireEvent.click(await screen.findByRole('button', { name: '投票を作成' }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/app-commands', expect.objectContaining({ method: 'POST' })))
    const body = JSON.parse(String(mockFetch.mock.calls.find(([url]) => url === '/api/app-commands')![1].body))
    expect(body).toEqual({ installationId: 'i1', channelId: 'c1', command: '/poll', locale: 'ja' })
  })

  it('Bot がいなければ追加を確かめ、追加してから起動する', async () => {
    mockFetch.mockImplementation(async (url: string) => (url.endsWith('/app-entry-points') ? json(app(false)) : json({ ok: true })))
    renderButtons()
    fireEvent.click(await screen.findByRole('button', { name: '投票を作成' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('このチャンネルに投票を追加しますか？')
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/app-commands', expect.anything()))
    const urls = mockFetch.mock.calls.map(([url]) => url)
    expect(urls.indexOf('/api/channels/c1/apps')).toBeLessThan(urls.indexOf('/api/app-commands'))
  })

  it('アプリが応答しなければ、その旨を入力欄のエラーに出す', async () => {
    mockFetch.mockImplementation(async (url: string) => (url.endsWith('/app-entry-points') ? json(app(true)) : json({ error: 'app_timeout' }, 502)))
    const onError = renderButtons()
    fireEvent.click(await screen.findByRole('button', { name: '投票を作成' }))
    await waitFor(() => expect(onError).toHaveBeenLastCalledWith('アプリが応答しませんでした。もう一度お試しください。'))
  })

  it('起動口を読み込めなければ、黙って隠さず再試行できる表示にする', async () => {
    mockFetch.mockResolvedValue(json({ error: 'x' }, 500))
    renderButtons()
    expect(await screen.findByRole('button', { name: 'アプリを読み込めませんでした' })).toBeInTheDocument()
  })
})
