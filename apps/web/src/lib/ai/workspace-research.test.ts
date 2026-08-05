// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001'
const USER_ID = '20000000-0000-4000-8000-000000000001'
const PROJECT_ID = '30000000-0000-4000-8000-000000000001'

const { mockGetWorkspaceRole, mockGetGuestVisibleProjectIds, mockDbSelect } = vi.hoisted(() => ({
  mockGetWorkspaceRole: vi.fn(),
  mockGetGuestVisibleProjectIds: vi.fn(),
  mockDbSelect: vi.fn(),
}))

vi.mock('@/lib/access/membership', () => ({ getWorkspaceRole: mockGetWorkspaceRole }))
vi.mock('@/lib/permissions', () => ({
  getGuestVisibleProjectIds: mockGetGuestVisibleProjectIds,
}))
vi.mock('@/lib/ai/search-chunks', () => ({ searchChunks: vi.fn() }))
vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect },
  projects: {
    id: 'projects.id',
    workspaceId: 'projects.workspaceId',
    title: 'projects.title',
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
}))

function chain(result: unknown[]) {
  const promise = Promise.resolve(result)
  const value: Record<string, unknown> = {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  }
  for (const method of ['from', 'where', 'limit']) value[method] = vi.fn(() => value)
  return value
}

function ctx(role: 'member' | 'guest' = 'member') {
  return { workspaceId: WORKSPACE_ID, userId: USER_ID, role }
}

describe('AI横断調査の認可', () => {
  beforeEach(() => {
    mockGetWorkspaceRole.mockResolvedValue('member')
    mockGetGuestVisibleProjectIds.mockResolvedValue([])
  })

  afterEach(() => vi.clearAllMocks())

  test('非活性メンバーは調査データを取得できない', async () => {
    mockGetWorkspaceRole.mockResolvedValue(null)
    const { listResearchProjects, ResearchAccessError } = await import('./workspace-research')
    await expect(listResearchProjects(ctx())).rejects.toBeInstanceOf(ResearchAccessError)
    expect(mockDbSelect).not.toHaveBeenCalled()
  })

  test('guestは未参加プロジェクトのタスクを取得できない', async () => {
    mockGetWorkspaceRole.mockResolvedValue('guest')
    mockGetGuestVisibleProjectIds.mockResolvedValue([])
    const { listResearchProjectTasks, ResearchAccessError } = await import('./workspace-research')
    await expect(
      listResearchProjectTasks(ctx('guest'), { projectId: PROJECT_ID }),
    ).rejects.toBeInstanceOf(ResearchAccessError)
    expect(mockDbSelect).not.toHaveBeenCalled()
  })

  test('別workspaceのproject IDはworkspace条件との突合で拒否する', async () => {
    mockDbSelect.mockReturnValueOnce(chain([]))
    const { listResearchProjectTasks, ResearchAccessError } = await import('./workspace-research')
    await expect(
      listResearchProjectTasks(ctx(), { projectId: PROJECT_ID }),
    ).rejects.toBeInstanceOf(ResearchAccessError)
    expect(mockDbSelect).toHaveBeenCalledTimes(1)
  })

  test('private channelは現在の参加者だけが取得対象になる', async () => {
    const { canAccessResearchChannel } = await import('./workspace-research')
    const channel = { id: 'private-1', type: 'workspace', isPrivate: true, projectId: null }
    expect(canAccessResearchChannel(channel, { role: 'member', guestProjectIds: null }, new Set()))
      .toBe(false)
    expect(
      canAccessResearchChannel(
        channel,
        { role: 'member', guestProjectIds: null },
        new Set(['private-1']),
      ),
    ).toBe(true)
  })

  test('DMは参加者でも検索対象にしない', async () => {
    const { canAccessResearchChannel } = await import('./workspace-research')
    expect(
      canAccessResearchChannel(
        { id: 'dm-1', type: 'dm', isPrivate: false, projectId: null },
        { role: 'member', guestProjectIds: null },
        new Set(['dm-1']),
      ),
    ).toBe(false)
  })
})
