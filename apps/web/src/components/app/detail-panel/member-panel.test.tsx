// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemberDetailPanel } from './member-panel'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'

const fetchWithAuth = vi.fn()

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuth(...args),
}))

const TARGET: WorkspaceMemberDto = {
  userId: 'user-1',
  displayName: '山田 太郎',
  email: 'taro@example.com',
  avatarUrl: null,
  role: 'member',
  membershipStatus: 'active',
  joinedAt: '2026-01-01',
  projectCount: 1,
}

const ADMIN: WorkspaceMemberDto = {
  userId: 'admin-1',
  displayName: '管理者',
  email: 'admin@example.com',
  avatarUrl: null,
  role: 'admin',
  membershipStatus: 'active',
  joinedAt: '2025-01-01',
  projectCount: 0,
}

const GUEST: WorkspaceMemberDto = {
  ...TARGET,
  userId: 'guest-1',
  displayName: 'ゲスト太郎',
  role: 'guest',
}

function jsonResponse(data: unknown, ok = true) {
  return {
    ok,
    json: async () => data,
  }
}

function renderPanel(member: WorkspaceMemberDto, opts: { isMobile?: boolean; viewer?: WorkspaceMemberDto } = {}) {
  const viewer = opts.viewer ?? ADMIN
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['me'], { id: viewer.userId })
  qc.setQueryData(['workspace-members'], [viewer, member])
  qc.setQueryData(['member-projects', member.userId], [])

  return render(
    <QueryClientProvider client={qc}>
      <MemberDetailPanel
        member={member}
        onProjectClick={vi.fn()}
        onClose={vi.fn()}
        {...(opts.isMobile ? { isMobile: true } : {})}
      />
    </QueryClientProvider>,
  )
}

describe('MemberDetailPanel — ロール変更', () => {
  beforeEach(() => {
    fetchWithAuth.mockReset()
    fetchWithAuth.mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/projects')) {
        return Promise.resolve(jsonResponse([]))
      }
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { role: string }
        return Promise.resolve(jsonResponse({ userId: TARGET.userId, role: body.role }))
      }
      return Promise.resolve(jsonResponse([]))
    })
  })

  it('モバイルでも管理者はロール変更ドロップダウンを開ける', async () => {
    renderPanel(TARGET, { isMobile: true })

    await userEvent.click(screen.getByRole('button', { name: 'ワークスペース権限を変更' }))
    expect(screen.getByRole('option', { name: '管理者' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'メンバー' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'ゲスト' })).toBeNull()
  })

  it('モバイルでロールを選ぶと PATCH する', async () => {
    renderPanel(TARGET, { isMobile: true })

    await userEvent.click(screen.getByRole('button', { name: 'ワークスペース権限を変更' }))
    await userEvent.click(screen.getByRole('option', { name: '管理者' }))

    await waitFor(() => {
      expect(fetchWithAuth).toHaveBeenCalledWith(
        `/api/workspaces/members/${TARGET.userId}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ role: 'admin' }),
        }),
      )
    })
  })

  it('ゲストのロールは変更できない（読み取り専用バッジ）', () => {
    renderPanel(GUEST, { isMobile: true })

    expect(screen.queryByRole('button', { name: 'ワークスペース権限を変更' })).toBeNull()
    expect(screen.getByText('ゲスト')).toBeInTheDocument()
  })
})
