// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InstructionEditor } from './instruction-editor'

const { fetchWithAuth } = vi.hoisted(() => ({ fetchWithAuth: vi.fn() }))
vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth }))

const ROLE_ID = '5f000000-0000-4000-8000-0000000000a1'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function Harness({ onValue }: { onValue: (value: string) => void }) {
  const [value, setValue] = React.useState('')
  return <InstructionEditor id="instruction" value={value} onChange={next => { setValue(next); onValue(next) }} placeholder="指示文"/>
}

function renderEditor(onValue = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><Harness onValue={onValue}/></QueryClientProvider>)
  return onValue
}

describe('指示文の入力補完', () => {
  beforeEach(() => {
    fetchWithAuth.mockReset()
  })

  it('入力中の名前でサーバー側を絞り込み、候補をクリックやキーボードで選べる', async () => {
    fetchWithAuth.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.startsWith('/api/research/members')) return json({ items: [] })
      if (url === '/api/workspaces/profile-attributes') return json([])
      if (url === '/api/projects/roles') return json([{ id: ROLE_ID, name: 'レビュワー', color: '#000', sortOrder: 1, isDefault: false }])
      throw new Error(`unexpected ${url}`)
    })
    const onValue = renderEditor()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('指示文'), '@レビ')

    const option = await screen.findByRole('option', { name: /@レビュワー/ })
    expect(fetchWithAuth).toHaveBeenCalledWith(expect.stringContaining(`query=${encodeURIComponent('レビ')}`))
    option.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(onValue).toHaveBeenLastCalledWith(`<@role:${ROLE_ID}|レビュワー> `))
  })

  it('役割や属性を取得できなければ、一致なしに見せずエラーを出す', async () => {
    fetchWithAuth.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.startsWith('/api/research/members')) return json({ items: [] })
      if (url === '/api/workspaces/profile-attributes') return json([])
      if (url === '/api/projects/roles') return json({ error: 'failed' }, 500)
      throw new Error(`unexpected ${url}`)
    })
    renderEditor()
    await userEvent.setup().type(screen.getByPlaceholderText('指示文'), '@レ')
    expect(await screen.findByRole('alert')).toHaveTextContent('役割の取得に失敗しました')
    expect(screen.queryByText('一致する候補がありません')).toBeNull()
  })

  it('名前に記法を閉じる文字があっても、参照の外へ名前がはみ出さない形で入れる', async () => {
    fetchWithAuth.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.startsWith('/api/research/channels')) {
        return json({ items: [{ id: '50000000-0000-4000-8000-000000000009', name: '計画 > 最終\n版' }] })
      }
      if (url === '/api/projects/roles') return json([])
      throw new Error(`unexpected ${url}`)
    })
    const onValue = renderEditor()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('指示文'), '#計')
    await user.click(await screen.findByRole('option', { name: /#計画/ }))
    expect(onValue).toHaveBeenLastCalledWith('<#50000000-0000-4000-8000-000000000009|計画 最終 版> ')
  })
})

