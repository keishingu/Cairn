// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const PROJECT_ID = '20000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockRunForActiveMembership, mockDbSelect } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRunForActiveMembership: vi.fn(),
  mockDbSelect: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/access/active-membership-lock', () => ({
  runForActiveMembership: mockRunForActiveMembership,
}))
vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect },
  projects: { id: 'projects.id', workspaceId: 'projects.workspaceId' },
  pinnedProjects: {
    userId: 'pinnedProjects.userId',
    workspaceId: 'pinnedProjects.workspaceId',
  },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => Symbol('eq')),
  and: vi.fn(() => Symbol('and')),
  count: vi.fn(() => Symbol('count')),
}))

function selectChain(result: unknown[]) {
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => builder,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return builder
}

describe('POST /api/projects/pinned', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockDbSelect.mockReturnValue(selectChain([{ id: PROJECT_ID }]))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('退会済みならプロジェクトをピンできない', async () => {
    mockRunForActiveMembership.mockResolvedValue(null)

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost/api/projects/pinned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: PROJECT_ID }),
      }),
    )

    expect(response.status).toBe(403)
    expect(mockRunForActiveMembership).toHaveBeenCalledWith(
      expect.anything(),
      WORKSPACE_ID,
      USER_ID,
      expect.any(Function),
    )
  })
})
