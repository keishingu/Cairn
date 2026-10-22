// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pollModalFixture } from '@cairn/shared/blocks/fixtures'

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))
vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth: mockFetch }))

import { AppModalHost } from './app-modal-host'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function renderHost() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AppModalHost />
    </QueryClientProvider>,
  )
}

describe('アプリのモーダル', () => {
  let views: unknown[]
  beforeEach(() => {
    mockFetch.mockReset()
    views = [{ id: 'v1', hash: 'h1', view: pollModalFixture, appName: '投票', appIconUrl: null }]
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/app-views') return json(views)
      if (url.endsWith('/submit')) return json({ status: 'errors', errors: { options: { message: '2つ以上入力してください' }, question: { code: 'required' } } }, 422)
      if (url.endsWith('/close')) {
        views = []
        return json({ ok: true })
      }
      return json({}, 404)
    })
  })

  it('開かれたモーダルの入力欄を出し、入力して送信するとサーバーの検証やアプリのエラーを欄ごとに出す', async () => {
    renderHost()
    expect(await screen.findByRole('heading', { name: '投票を作成' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('選択肢（1行に1つ）'), { target: { value: '第1週' } })
    fireEvent.click(screen.getByRole('button', { name: '作成' }))

    expect(await screen.findByText('2つ以上入力してください')).toBeInTheDocument()
    expect(screen.getByText('入力してください。')).toBeInTheDocument()
    const submitCall = mockFetch.mock.calls.find(([url]) => String(url).endsWith('/submit'))!
    expect(JSON.parse(String((submitCall[1] as RequestInit).body))).toEqual({ hash: 'h1', locale: 'ja', values: { question: { value: '' }, options: { value: '第1週' }, mode: { value: '' } } })
  })

  it('閉じるとサーバーに伝え、一覧から消えたらモーダルを閉じる', async () => {
    renderHost()
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: '投票を作成' })).toBeNull())
    expect(mockFetch).toHaveBeenCalledWith('/api/app-views/v1/close', { method: 'POST' })
  })

  it('知らない入力欄を含むモーダルは送信できない表示にする', async () => {
    views = [{
      id: 'v2',
      hash: 'h',
      appName: '投票',
      appIconUrl: null,
      view: {
        type: 'modal',
        title: { type: 'plain_text', text: '日程' },
        submit: { type: 'plain_text', text: '送信' },
        blocks: [{ type: 'input', block_id: 'd', label: { type: 'plain_text', text: '日付' }, element: { type: 'datepicker', action_id: 'v' } }],
      },
    }]
    renderHost()
    expect(await screen.findByRole('button', { name: '送信' })).toBeDisabled()
    // 未対応の欄の位置の案内と、フォーム全体を送れない案内の両方を出す
    const notes = screen.getAllByRole('note').map((note) => note.textContent ?? '')
    expect(notes.some((text) => text.includes('送信できません'))).toBe(true)
    expect(notes.some((text) => text.includes('カードのこの部分'))).toBe(true)
  })
})
