// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { PageMembers } from './members-page'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'

// ─── next/navigation モック ────────────────────────────────────────

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

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
  membershipStatus: 'active',
  profileAttributes: ['3年生'],
  joinedAt: '2026-01-01',
  projectCount: 3,
}

function makeQC(members: WorkspaceMemberDto[] = [STUB_MEMBER]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['workspace-members', 'all'], members)
  return qc
}

function renderMobile(initialUserId?: string) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <PageMembers isMobile {...(initialUserId !== undefined ? { initialUserId } : {})} />
    </QueryClientProvider>,
  )
}

// ─── テスト ────────────────────────────────────────────────────────

describe('PageMembers (モバイル) — カードタップの URL 更新', () => {
  beforeEach(() => mockPush.mockClear())

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
  beforeEach(() => mockPush.mockClear())

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
  beforeEach(() => mockPush.mockClear())

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

describe('PageMembers — アーカイブ導線（admin）', () => {
  const ARCHIVED_MEMBER: WorkspaceMemberDto = {
    userId: 'user-2',
    displayName: '佐藤 花子',
    email: 'hanako@example.com',
    avatarUrl: null,
    role: 'member',
    membershipStatus: 'inactive',
    profileAttributes: [],
    joinedAt: '2025-04-01',
    projectCount: 0,
  }

  function renderAsAdmin(members: WorkspaceMemberDto[]) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(['workspace-members', 'all'], members)
    qc.setQueryData(['me'], { id: 'admin-1', wsRole: 'admin' })
    return render(
      <QueryClientProvider client={qc}>
        <PageMembers isMobile />
      </QueryClientProvider>,
    )
  }

  it('admin には現役メンバーのカードに操作メニューが出る', () => {
    renderAsAdmin([STUB_MEMBER])
    expect(screen.getByLabelText('メンバー操作')).toBeInTheDocument()
  })

  it('非活性メンバーは既定で隠れ、「アーカイブ済み」トグルで表示される', async () => {
    renderAsAdmin([STUB_MEMBER, ARCHIVED_MEMBER])
    // 既定は現役のみ
    expect(screen.queryByText('佐藤 花子')).toBeNull()
    await userEvent.click(screen.getByText('アーカイブ済み (1)'))
    expect(screen.getByText('佐藤 花子')).toBeInTheDocument()
  })

  it('操作メニューを開くと非活性メンバーには「アーカイブを解除」が出る', async () => {
    renderAsAdmin([ARCHIVED_MEMBER])
    await userEvent.click(screen.getByText('アーカイブ済み (1)'))
    await userEvent.click(screen.getByLabelText('メンバー操作'))
    expect(screen.getByText('アーカイブを解除')).toBeInTheDocument()
  })
})
