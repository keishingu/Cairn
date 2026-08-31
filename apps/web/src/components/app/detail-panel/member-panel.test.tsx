// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemberDetailPanel } from './member-panel'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import { __resetToastsForTest, subscribeToasts } from '@/lib/toast'

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

const OWNER: WorkspaceMemberDto = {
  userId: 'owner-1',
  displayName: 'オーナー',
  email: 'owner@example.com',
  avatarUrl: null,
  role: 'owner',
  membershipStatus: 'active',
  joinedAt: '2024-01-01',
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

function renderPanel(
  member: WorkspaceMemberDto,
  opts: { isMobile?: boolean; viewer?: WorkspaceMemberDto; members?: WorkspaceMemberDto[] } = {},
) {
  const viewer = opts.viewer ?? ADMIN
  const members = opts.members ?? [viewer, member]
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['me'], { id: viewer.userId })
  qc.setQueryData(['workspace-members'], members)
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

function mockApis(
  members: WorkspaceMemberDto[],
  meId: string,
  patch?: (body: { role: string }) => { ok: boolean; data: unknown },
) {
  fetchWithAuth.mockReset()
  fetchWithAuth.mockImplementation((url: string, init?: RequestInit) => {
    if (typeof url === 'string' && url === '/api/me') {
      return Promise.resolve(jsonResponse({ id: meId }))
    }
    if (typeof url === 'string' && url === '/api/workspaces/members') {
      return Promise.resolve(jsonResponse(members))
    }
    if (typeof url === 'string' && url.includes('/projects')) {
      return Promise.resolve(jsonResponse([]))
    }
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as { role: string }
      if (patch) {
        const result = patch(body)
        return Promise.resolve(jsonResponse(result.data, result.ok))
      }
      return Promise.resolve(jsonResponse({ userId: TARGET.userId, role: body.role }))
    }
    return Promise.resolve(jsonResponse([]))
  })
}

describe('MemberDetailPanel — ロール変更', () => {
  beforeEach(() => {
    __resetToastsForTest()
  })

  it('モバイルでも管理者はロール変更ドロップダウンを開ける', async () => {
    mockApis([ADMIN, TARGET], ADMIN.userId)
    renderPanel(TARGET, { isMobile: true })

    await userEvent.click(await screen.findByRole('button', { name: 'ワークスペース権限を変更' }))
    expect(screen.getByRole('option', { name: '管理者' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'メンバー' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'ゲスト' })).toBeNull()
  })

  it('モバイルでロールを選ぶと PATCH する', async () => {
    mockApis([ADMIN, TARGET], ADMIN.userId)
    renderPanel(TARGET, { isMobile: true })

    await userEvent.click(await screen.findByRole('button', { name: 'ワークスペース権限を変更' }))
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

  it('ゲストのロールは変更できない（読み取り専用バッジ）', async () => {
    mockApis([ADMIN, GUEST], ADMIN.userId)
    renderPanel(GUEST, { isMobile: true })

    await screen.findByText('ゲスト')
    expect(screen.queryByRole('button', { name: 'ワークスペース権限を変更' })).toBeNull()
  })

  it('唯一の owner は降格候補を出さない', async () => {
    mockApis([OWNER, TARGET], OWNER.userId)
    renderPanel(OWNER, { isMobile: true, viewer: OWNER, members: [OWNER, TARGET] })

    await userEvent.click(await screen.findByRole('button', { name: 'ワークスペース権限を変更' }))
    expect(screen.getByRole('option', { name: 'オーナー' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '管理者' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'メンバー' })).toBeNull()
  })

  it('ロール変更が失敗したらトーストで理由を表示する', async () => {
    const seen: string[] = []
    const unsubscribe = subscribeToasts((items) => {
      for (const item of items) {
        if (item.variant === 'error') seen.push(item.message)
      }
    })

    mockApis([ADMIN, TARGET], ADMIN.userId, () => ({
      ok: false,
      data: { error: 'ワークスペースには最低1人の owner が必要です' },
    }))
    renderPanel(TARGET, { isMobile: true })

    await userEvent.click(await screen.findByRole('button', { name: 'ワークスペース権限を変更' }))
    await userEvent.click(screen.getByRole('option', { name: '管理者' }))

    await waitFor(() => {
      expect(seen).toContain('ワークスペースには最低1人の owner が必要です')
    })
    expect(screen.getByRole('button', { name: 'ワークスペース権限を変更' })).toHaveTextContent('メンバー')
    unsubscribe()
  })
})
