// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { PageMembers } from './members-page'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'

const mockFetchWithAuth = vi.fn()
const mockUseWorkspacePermissions = vi.fn(() => ({
  wsRole: 'admin',
  isOwner: false,
  isAdmin: true,
  isMember: true,
  isGuest: false,
}))

// ─── next/navigation モック ────────────────────────────────────────

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: (...args: unknown[]) => mockFetchWithAuth(...args),
}))

vi.mock('@/hooks/use-current-user', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-current-user')>('@/hooks/use-current-user')
  return {
    ...actual,
    useWorkspacePermissions: () => mockUseWorkspacePermissions(),
  }
})

// ─── 子コンポーネントモック ────────────────────────────────────────

vi.mock('@/components/app/detail-panel/member-panel', () => ({
  MemberDetailPanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="member-panel">
      <button onClick={onClose}>閉じる</button>
    </div>
  ),
}))

vi.mock('@/components/app/detail-panel/project-panel', () => ({
  ProjectPanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="project-panel">
      <button onClick={onClose}>閉じる</button>
    </div>
  ),
}))

vi.mock('@/components/app/mobile/header', () => ({
  MobileHeader: ({ title }: { title: string }) => <div>{title}</div>,
}))

// ─── テスト用フィクスチャ ──────────────────────────────────────────

const STUB_MEMBER: WorkspaceMemberDto = {
  userId: 'user-1',
  displayName: '山田 太郎',
  email: 'taro@example.com',
  avatarUrl: null,
  role: 'member',
  joinedAt: '2026-01-01',
  projectCount: 3,
}

function makeQC(members: WorkspaceMemberDto[] = [STUB_MEMBER]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['workspace-members'], members)
  return qc
}

function renderMobile(initialUserId?: string) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <PageMembers isMobile {...(initialUserId !== undefined ? { initialUserId } : {})} />
    </QueryClientProvider>,
  )
}

function renderDesktop() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <PageMembers />
    </QueryClientProvider>,
  )
}

// ─── テスト ────────────────────────────────────────────────────────

describe('PageMembers (モバイル) — カードタップの URL 更新', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockFetchWithAuth.mockReset()
    mockFetchWithAuth.mockResolvedValue({ json: async () => [STUB_MEMBER] })
  })

  it('メンバーカードをタップすると /members/{userId} に router.push する', async () => {
    renderMobile()
    await userEvent.click(screen.getByText('山田 太郎'))
    expect(mockPush).toHaveBeenCalledWith('/members/user-1', { scroll: false })
  })

  it('タップするとメンバーパネルが開く', async () => {
    renderMobile()
    await userEvent.click(screen.getByText('山田 太郎'))
    expect(screen.getByTestId('member-panel')).toBeInTheDocument()
  })
})

describe('PageMembers (モバイル) — パネルを閉じたときの URL 更新', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockFetchWithAuth.mockReset()
    mockFetchWithAuth.mockResolvedValue({ json: async () => [STUB_MEMBER] })
  })

  it('パネルの閉じるボタンは /members に router.push する', async () => {
    renderMobile()
    await userEvent.click(screen.getByText('山田 太郎'))
    await userEvent.click(screen.getByText('閉じる'))
    expect(mockPush).toHaveBeenLastCalledWith('/members', { scroll: false })
  })

  it('パネルを閉じるとパネルが非表示になる', async () => {
    renderMobile()
    await userEvent.click(screen.getByText('山田 太郎'))
    await userEvent.click(screen.getByText('閉じる'))
    expect(screen.queryByTestId('member-panel')).toBeNull()
  })
})

describe('PageMembers (モバイル) — initialUserId によるパネル復元', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockFetchWithAuth.mockReset()
    mockFetchWithAuth.mockResolvedValue({ json: async () => [STUB_MEMBER] })
  })

  it('initialUserId が渡されたとき、メンバーが読み込まれ次第パネルを開く', async () => {
    renderMobile('user-1')
    expect(await screen.findByTestId('member-panel')).toBeInTheDocument()
  })

  it('initialUserId が存在しない ID の場合はパネルを開かない', () => {
    renderMobile('unknown-id')
    expect(screen.queryByTestId('member-panel')).toBeNull()
  })
})

describe('PageMembers — email tooltip', () => {
  it('メンバーカードに email の title を付ける', () => {
    renderMobile()

    expect(screen.getByTitle('taro@example.com')).toBeInTheDocument()
  })
})

describe('InviteModal', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockFetchWithAuth.mockReset()
    mockFetchWithAuth.mockResolvedValue({ json: async () => [STUB_MEMBER] })
  })

  it('招待リンク生成時に選択した role=guest を送る', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invites: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://example.com/invite/guest-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invites: [{ token: 'guest-token', url: 'https://example.com/invite/guest-token', expiresAt: null, maxUses: null, useCount: 0, role: 'guest', id: '1', createdAt: '2026-01-01', createdByName: 'Admin' }] }),
      })
    vi.stubGlobal('fetch', fetchMock)

    renderDesktop()
    await userEvent.click(screen.getByRole('button', { name: 'メンバーを招待' }))
    await userEvent.click(screen.getByRole('button', { name: 'ゲスト 閲覧中心の外部参加向け' }))
    await userEvent.click(screen.getByRole('button', { name: '招待リンクを生成' }))

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/workspaces/invites', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: '1h', role: 'guest' }),
    }))
  })

  it('role を変更しなければ member のまま送る', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invites: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://example.com/invite/member-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invites: [{ token: 'member-token', url: 'https://example.com/invite/member-token', expiresAt: null, maxUses: null, useCount: 0, role: 'member', id: '1', createdAt: '2026-01-01', createdByName: 'Admin' }] }),
      })
    vi.stubGlobal('fetch', fetchMock)

    renderDesktop()
    await userEvent.click(screen.getByRole('button', { name: 'メンバーを招待' }))
    await userEvent.click(screen.getByRole('button', { name: '招待リンクを生成' }))

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/workspaces/invites', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: '1h', role: 'member' }),
    }))
  })

  it('生成中は role を切り替えられない', async () => {
    let resolveInvite: ((value: { ok: boolean; json: () => Promise<{ url: string }> }) => void) | null = null
    const pendingInvite = new Promise<{ ok: boolean; json: () => Promise<{ url: string }> }>(resolve => {
      resolveInvite = resolve
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invites: [] }),
      })
      .mockReturnValueOnce(pendingInvite)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invites: [{ token: 'member-token', url: 'https://example.com/invite/member-token', expiresAt: null, maxUses: null, useCount: 0, role: 'member', id: '1', createdAt: '2026-01-01', createdByName: 'Admin' }] }),
      })
    vi.stubGlobal('fetch', fetchMock)

    renderDesktop()
    await userEvent.click(screen.getByRole('button', { name: 'メンバーを招待' }))

    const memberButton = screen.getByRole('button', { name: 'メンバー 通常メンバーとして参加' })
    const guestButton = screen.getByRole('button', { name: 'ゲスト 閲覧中心の外部参加向け' })
    await userEvent.click(screen.getByRole('button', { name: '招待リンクを生成' }))

    expect(memberButton).toBeDisabled()
    expect(guestButton).toBeDisabled()

    await userEvent.click(guestButton)

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/workspaces/invites', expect.objectContaining({
      body: JSON.stringify({ expiresIn: '1h', role: 'member' }),
    }))

    resolveInvite?.({
      ok: true,
      json: async () => ({ url: 'https://example.com/invite/member-token' }),
    })

    expect(await screen.findByText('コピー')).toBeInTheDocument()
  })
})
