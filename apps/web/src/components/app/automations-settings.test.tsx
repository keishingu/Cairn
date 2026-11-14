// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AutomationsSettings } from './automations-settings'

const { fetchWithAuth } = vi.hoisted(() => ({ fetchWithAuth: vi.fn() }))
vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth }))
vi.mock('@/hooks/use-current-user', () => ({ useWorkspacePermissions: () => ({ isAdmin: true, isMember: true }) }))

const USER_ID = '00000000-0000-4000-8000-000000000006'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('スキルのテスト実行の結果', () => {
  beforeEach(() => {
    fetchWithAuth.mockReset()
  })

  it('承認カードを出さない代わりに、投稿の本文をメンションの名前つきで見せる', async () => {
    fetchWithAuth.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/api/automations') {
        return json([{
          id: 'a1', kind: 'skill', name: 'assign-reviewer', instruction: '指示', writeActions: ['post_message'],
          enabled: true, pausedReason: null, createdBy: null, createdAt: '', updatedAt: '',
        }])
      }
      if (url === '/api/automations/a1/dry-run') {
        return json({
          runId: 'r1',
          text: '回答',
          proposals: [{
            actionType: 'post_message',
            payload: { channelId: 'c1', text: `<@${USER_ID}> レビューをお願いします` },
            display: { channel: { id: 'c1', name: '雪山訓練' }, mentionNames: { [USER_ID]: '高橋 美咲' } },
            reason: null,
          }],
          evidence: [],
          toolCalls: [],
        })
      }
      throw new Error(`unexpected ${url}`)
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><AutomationsSettings/></QueryClientProvider>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '操作' }))
    await user.click(await screen.findByText('テスト実行'))
    await user.click(await screen.findByRole('button', { name: 'テスト実行' }))
    const post = await screen.findByTestId('dry-run-post-text')
    expect(within(post).getByText(/高橋 美咲/)).toBeTruthy()
    expect(within(post).getByText(/レビューをお願いします/)).toBeTruthy()
  })
})
