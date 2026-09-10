// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useDetailPanel } from './use-detail-panel'
import type { ProjectDto } from '@/app/api/projects/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import { STORAGE_KEYS } from '@/lib/storage-keys'

const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockBack = vi.fn()
let mockPathname = '/projects'
let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
}))

const STUB_PROJECT: ProjectDto = {
  id: 'proj-1',
  title: 'テストプロジェクト',
  description: null,
  statusName: '実施中',
  statusColor: '#8B5CF6',
  startDate: '2026-01-01',
  endDate: null,
  memberCount: 1,
  memberNames: [],
  memberAvatarUrls: [],
  taskCount: 0,
  completedTaskCount: 0,
  isOwner: true,
  isMember: true,
  archived: false,
  coverPhotoIdx: 0,
  coverPhotoUrl: null,
  location: null,
  placeId: null,
}

const STUB_MEMBER: WorkspaceMemberDto = {
  userId: 'user-1',
  displayName: 'テストユーザー',
  email: 'test@example.com',
  avatarUrl: null,
  role: 'member',
  membershipStatus: 'active',
  profileAttributes: [],
  joinedAt: '2026-01-01',
  projectCount: 0,
}

function makeWrapper(projects: ProjectDto[] = [STUB_PROJECT], members: WorkspaceMemberDto[] = [STUB_MEMBER]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['projects'], projects)
  qc.setQueryData(['workspace-members'], members)
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return Wrapper
}

describe('useDetailPanel — panelState の導出', () => {
  beforeEach(() => {
    localStorage.clear()
    mockPush.mockClear()
    mockBack.mockClear()
    mockPathname = '/projects'
    mockSearchParams = new URLSearchParams()
  })

  it('?open なしでは panelState が null', () => {
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    expect(result.current.panelState).toBeNull()
    expect(result.current.panelProject).toBeNull()
    expect(result.current.panelMember).toBeNull()
  })

  it('?open=project-{id} では panelProject を返す', () => {
    mockSearchParams = new URLSearchParams('open=project-proj-1')
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    expect(result.current.panelState).toEqual({ type: 'project', id: 'proj-1' })
    expect(result.current.panelProject).toMatchObject({ id: 'proj-1' })
    expect(result.current.panelMember).toBeNull()
  })

  it('?open=member-{id} では panelMember を返す', () => {
    mockSearchParams = new URLSearchParams('open=member-user-1')
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    expect(result.current.panelState).toEqual({ type: 'member', id: 'user-1' })
    expect(result.current.panelMember).toMatchObject({ userId: 'user-1' })
    expect(result.current.panelProject).toBeNull()
  })

  it('キャッシュにない ID では null を返す', () => {
    mockSearchParams = new URLSearchParams('open=project-unknown')
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    expect(result.current.panelProject).toBeNull()
  })
})

describe('useDetailPanel — 操作関数', () => {
  beforeEach(() => {
    localStorage.clear()
    mockPush.mockClear()
    mockReplace.mockClear()
    mockBack.mockClear()
    mockPathname = '/projects'
    mockSearchParams = new URLSearchParams()
  })

  it('openPanel(project) は ?open=project-{id} へ push する', () => {
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    act(() => result.current.openPanel(STUB_PROJECT))
    expect(mockPush).toHaveBeenCalledWith('/projects?open=project-proj-1', { scroll: false })
  })

  it('openPanel() 引数なしは ?open なし URL へ push する', () => {
    mockSearchParams = new URLSearchParams('open=project-proj-1')
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    act(() => result.current.openPanel())
    expect(mockPush).toHaveBeenCalledWith('/projects', { scroll: false })
  })

  it('openProjectById は ?open=project-{id} へ push する', () => {
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    act(() => result.current.openProjectById('proj-1'))
    expect(mockPush).toHaveBeenCalledWith('/projects?open=project-proj-1', { scroll: false })
  })

  it('openMember は ?open=member-{userId} へ push する', () => {
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    act(() => result.current.openMember('user-1'))
    expect(mockPush).toHaveBeenCalledWith('/projects?open=member-user-1', { scroll: false })
  })

  it('closePanel は ?open を除いた URL へ push する', () => {
    mockSearchParams = new URLSearchParams('open=project-proj-1')
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    act(() => result.current.closePanel())
    expect(mockPush).toHaveBeenCalledWith('/projects', { scroll: false })
  })

  it('backPanel は router.back() を呼ぶ', () => {
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    act(() => result.current.backPanel())
    expect(mockBack).toHaveBeenCalled()
  })

  it('別ページ (/chat) からでも ?open=member-{id} へ push する', () => {
    mockPathname = '/chat'
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    act(() => result.current.openMember('user-1'))
    expect(mockPush).toHaveBeenCalledWith('/chat?open=member-user-1', { scroll: false })
  })

  it('openMember は遷移元の ?tab を維持する', () => {
    mockSearchParams = new URLSearchParams('open=project-proj-1&tab=members')
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    act(() => result.current.openMember('user-1'))
    expect(mockPush).toHaveBeenCalledWith('/projects?open=member-user-1&tab=members', { scroll: false })
  })

  it('openProjectById は前回選択した ?tab を別プロジェクトにも引き継ぐ', () => {
    mockSearchParams = new URLSearchParams('open=project-proj-1&tab=members')
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    act(() => result.current.openProjectById('proj-2'))
    expect(mockPush).toHaveBeenCalledWith('/projects?open=project-proj-2&tab=members', { scroll: false })
  })

  it('closePanel は前回選択した ?tab を維持する', () => {
    mockSearchParams = new URLSearchParams('open=project-proj-1&tab=members')
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    act(() => result.current.closePanel())
    expect(mockPush).toHaveBeenCalledWith('/projects?tab=members', { scroll: false })
  })
})

describe('useDetailPanel — panelTab / setPanelTab', () => {
  beforeEach(() => {
    localStorage.clear()
    mockPush.mockClear()
    mockReplace.mockClear()
    mockBack.mockClear()
    mockPathname = '/projects'
    mockSearchParams = new URLSearchParams()
  })

  it('?tab なしでは panelTab が "chat"', () => {
    mockSearchParams = new URLSearchParams('open=project-proj-1')
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    expect(result.current.panelTab).toBe('chat')
  })

  it('?tab=members では panelTab が "members"', () => {
    mockSearchParams = new URLSearchParams('open=project-proj-1&tab=members')
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    expect(result.current.panelTab).toBe('members')
  })

  it('?tab なしでは localStorage の前回値を復元する', () => {
    localStorage.setItem(STORAGE_KEYS.project_detail_tab, 'members')
    mockSearchParams = new URLSearchParams('open=project-proj-1')
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    expect(result.current.panelTab).toBe('members')
  })

  it('setPanelTab は router.replace で ?tab を更新する（履歴を汚さない）', () => {
    mockSearchParams = new URLSearchParams('open=project-proj-1')
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    act(() => result.current.setPanelTab('members'))
    expect(mockReplace).toHaveBeenCalledWith('/projects?open=project-proj-1&tab=members', { scroll: false })
    expect(mockPush).not.toHaveBeenCalled()
    expect(localStorage.getItem(STORAGE_KEYS.project_detail_tab)).toBe('members')
  })

  it('保存済みタブを新しく開くプロジェクトの URL に引き継ぐ', () => {
    localStorage.setItem(STORAGE_KEYS.project_detail_tab, 'members')
    const { result } = renderHook(() => useDetailPanel(), { wrapper: makeWrapper() })
    act(() => result.current.openProjectById('proj-2'))
    expect(mockPush).toHaveBeenCalledWith('/projects?open=project-proj-2&tab=members', { scroll: false })
  })
})
