// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useProjectPanel } from './use-project-panel'
import type { ProjectDto } from '@/app/api/projects/route'

const mockPush = vi.fn()
let mockPathname = '/projects'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}))

const STUB_PROJECT: ProjectDto = {
  id: 'proj-1',
  title: 'テストプロジェクト',
  statusName: 'doing',
  startDate: '2026-01-01',
  endDate: null,
  memberCount: 1,
  memberNames: [],
  taskCount: 0,
  completedTaskCount: 0,
  isOwner: true,
  isMember: true,
  archived: false,
  coverPhotoIdx: 0,
  coverPhotoUrl: null,
}

function makeWrapper(projects: ProjectDto[] = [STUB_PROJECT]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['projects'], projects)
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return Wrapper
}

describe('useProjectPanel — panelProject の導出', () => {
  beforeEach(() => mockPush.mockClear())

  it('/projects では panelProject が null', () => {
    mockPathname = '/projects'
    const { result } = renderHook(() => useProjectPanel(), { wrapper: makeWrapper() })
    expect(result.current.panelProject).toBeNull()
  })

  it('/projects/{id} では対応するプロジェクトを返す', () => {
    mockPathname = '/projects/proj-1'
    const { result } = renderHook(() => useProjectPanel(), { wrapper: makeWrapper() })
    expect(result.current.panelProject).toMatchObject({ id: 'proj-1' })
  })

  it('キャッシュにない ID では null を返す', () => {
    mockPathname = '/projects/unknown'
    const { result } = renderHook(() => useProjectPanel(), { wrapper: makeWrapper() })
    expect(result.current.panelProject).toBeNull()
  })
})

describe('useProjectPanel — openPanel', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockPathname = '/projects'
  })

  it('openPanel(project) は /projects/{id} に router.push する', () => {
    const { result } = renderHook(() => useProjectPanel(), { wrapper: makeWrapper() })
    act(() => result.current.openPanel(STUB_PROJECT))
    expect(mockPush).toHaveBeenCalledWith('/projects/proj-1', { scroll: false })
  })

  it('openPanel() は /projects に router.push する', () => {
    const { result } = renderHook(() => useProjectPanel(), { wrapper: makeWrapper() })
    act(() => result.current.openPanel())
    expect(mockPush).toHaveBeenCalledWith('/projects', { scroll: false })
  })
})
