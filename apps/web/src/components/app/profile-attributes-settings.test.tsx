// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileAttributesSettings } from './profile-attributes-settings'

const { fetchWithAuth, permissions } = vi.hoisted(() => ({
  fetchWithAuth: vi.fn(),
  permissions: { isAdmin: true },
}))

vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth }))
vi.mock('@/hooks/use-current-user', () => ({ useWorkspacePermissions: () => permissions }))

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ProfileAttributesSettings />
    </QueryClientProvider>,
  )
}

describe('ProfileAttributesSettings', () => {
  beforeEach(() => {
    permissions.isAdmin = true
    fetchWithAuth.mockReset()
    fetchWithAuth.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/workspaces/profile-attributes' && !init) {
        return new Response(JSON.stringify([
          { id: 'attribute-1', name: '3年生', color: 'blue' },
        ]))
      }
      if (url === '/api/workspaces/profile-attributes' && init?.method === 'POST') {
        return new Response(String(init.body), { status: 201 })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
  })

  it('管理者は名称と色を指定して属性を追加できる', async () => {
    const user = userEvent.setup()
    renderSettings()
    expect(await screen.findByText('3年生')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '属性を追加' }))
    await user.type(screen.getByLabelText('属性名'), '経済学部')
    await user.click(screen.getByRole('button', { name: 'パープル' }))
    await user.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => {
      expect(fetchWithAuth).toHaveBeenCalledWith(
        '/api/workspaces/profile-attributes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: '経済学部', color: 'violet' }),
        }),
      )
    })
  })

  it('member には属性の変更操作を表示しない', async () => {
    permissions.isAdmin = false
    renderSettings()
    expect(await screen.findByText('3年生')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '属性を追加' })).toBeNull()
    expect(screen.getByText('属性の追加・編集・削除は管理者が行います。')).toBeInTheDocument()
  })
})
