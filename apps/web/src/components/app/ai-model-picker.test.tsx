// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiModelPicker, isConversationModelUnavailable } from './ai-model-picker'
import { useSetAiConversationModel } from '@/hooks/use-ai-conversations'

// ChatView と同じく、切り替えの保存は呼び出し側が持ってピッカーに渡す
function Harness({ model }: { model: 'gpt-5' | 'claude-opus-5-5' }) {
  const setModel = useSetAiConversationModel('conv-1')
  return <AiModelPicker conversationId="conv-1" model={model} changing={setModel.isPending} onChange={next => setModel.mutate(next)}/>
}

const { fetchWithAuth, toastError } = vi.hoisted(() => ({ fetchWithAuth: vi.fn(), toastError: vi.fn() }))
vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth }))
vi.mock('@/lib/toast', () => ({ toast: { error: toastError, success: vi.fn() } }))

const CREDITS = { 'gpt-5': 10, 'claude-sonnet-5-5': 10, 'claude-opus-5-5': 20 }

function renderPicker(
  model: 'gpt-5' | 'claude-opus-5-5',
  allowed: string[],
  patchStatus = 200,
  settingsStatus: () => number = () => 200,
) {
  fetchWithAuth.mockImplementation(async (input: string, init?: RequestInit) => {
    if (input === '/api/workspaces/settings' && !init) {
      if (settingsStatus() !== 200) return new Response(JSON.stringify({ error: 'failed' }), { status: settingsStatus() })
      return new Response(JSON.stringify({ aiChatModel: 'gpt-5', aiChatAllowedModels: allowed, aiChatRequestCredits: CREDITS }))
    }
    if (input === '/api/ai/conversations/conv-1' && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body))
      return patchStatus === 200
        ? new Response(JSON.stringify({ id: 'conv-1', title: null, model: body.model, createdAt: '2026-11-01T00:00:00.000Z' }))
        : new Response(JSON.stringify({ error: 'このモデルはワークスペースで選べません' }), { status: patchStatus })
    }
    return new Response(JSON.stringify({}))
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queryClient.setQueryData(['ai-conversations'], [{ id: 'conv-1', title: null, model, createdAt: '2026-11-01T00:00:00.000Z' }])
  render(
    <QueryClientProvider client={queryClient}>
      <Harness model={model}/>
    </QueryClientProvider>,
  )
  return queryClient
}

describe('AiModelPicker', () => {
  beforeEach(() => {
    fetchWithAuth.mockReset()
    toastError.mockReset()
  })

  it('owner が許可したモデルだけを、1回のクレジットと一緒に選ばせる', async () => {
    renderPicker('gpt-5', ['gpt-5', 'claude-opus-5-5'])

    const select = await screen.findByRole('combobox', { name: 'モデル' })
    await waitFor(() => expect(select).toBeEnabled())
    const options = screen.getAllByRole('option').map(option => option.textContent)
    expect(options).toEqual(['GPT-5・10 クレジット', 'Claude Opus 5.5・20 クレジット'])
  })

  it('選ぶと会話のモデルを保存し、一覧の会話のモデルも更新する', async () => {
    const queryClient = renderPicker('gpt-5', ['gpt-5', 'claude-opus-5-5'])

    const select = await screen.findByRole('combobox', { name: 'モデル' })
    await waitFor(() => expect(select).toBeEnabled())
    fireEvent.change(select, { target: { value: 'claude-opus-5-5' } })

    await waitFor(() =>
      expect(fetchWithAuth).toHaveBeenCalledWith(
        '/api/ai/conversations/conv-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ model: 'claude-opus-5-5' }) }),
      ),
    )
    await waitFor(() =>
      expect(queryClient.getQueryData(['ai-conversations'])).toEqual([
        expect.objectContaining({ id: 'conv-1', model: 'claude-opus-5-5' }),
      ]),
    )
  })

  it('切り替えに失敗したら理由を知らせ、会話のモデルは変えない', async () => {
    const queryClient = renderPicker('gpt-5', ['gpt-5', 'claude-opus-5-5'], 422)

    const select = await screen.findByRole('combobox', { name: 'モデル' })
    await waitFor(() => expect(select).toBeEnabled())
    fireEvent.change(select, { target: { value: 'claude-opus-5-5' } })

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('このモデルはワークスペースで選べません'))
    expect(queryClient.getQueryData(['ai-conversations'])).toEqual([expect.objectContaining({ model: 'gpt-5' })])
  })

  it('owner が外したモデルの会話では、使えないことを知らせて選び直させる', async () => {
    renderPicker('claude-opus-5-5', ['gpt-5'])

    expect(await screen.findByText(/このモデルはワークスペースの owner により使えなくなりました/)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Claude Opus 5\.5（使用不可）/ })).toBeDisabled()
  })

  it('選べるモデルを読み込めなければ、読み込み中のように見せず理由と再試行を出す', async () => {
    let status = 500
    renderPicker('gpt-5', ['gpt-5', 'claude-opus-5-5'], 200, () => status)

    expect(await screen.findByText(/選べるモデルを読み込めませんでした。/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'モデル' })).toBeDisabled()

    status = 200
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'モデル' })).toBeEnabled())
    expect(screen.queryByText(/選べるモデルを読み込めませんでした。/)).not.toBeInTheDocument()
  })
})

describe('isConversationModelUnavailable', () => {
  it('許可を読み込む前は使えないと判定しない', () => {
    expect(isConversationModelUnavailable('claude-opus-5-5', undefined)).toBe(false)
    expect(isConversationModelUnavailable('claude-opus-5-5', ['gpt-5'])).toBe(true)
    expect(isConversationModelUnavailable('gpt-5', ['gpt-5'])).toBe(false)
  })
})
