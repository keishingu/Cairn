// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const USER_ID = '00000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireWorkspaceAdmin,
  mockDbSelect,
  mockEq,
  mockIsIndexable,
  mockInngestSend,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireWorkspaceAdmin: vi.fn(),
  mockDbSelect: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockIsIndexable: vi.fn(),
  mockInngestSend: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireWorkspaceAdmin: mockRequireWorkspaceAdmin }))
vi.mock('@/lib/ai/extract-text', () => ({ isIndexable: mockIsIndexable }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))
vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect },
  files: { id: 'files.id', mimeType: 'files.mimeType', storagePath: 'files.storagePath', metadata: 'files.metadata', workspaceId: 'files.workspaceId' },
  workspaceMembers: { userId: 'workspaceMembers.userId', workspaceId: 'workspaceMembers.workspaceId' },
  projects: { id: 'projects.id', workspaceId: 'projects.workspaceId' },
}))
vi.mock('drizzle-orm', () => ({ eq: mockEq }))

function mockSelectResults(...results: unknown[]) {
  const queue = [...results]
  mockDbSelect.mockImplementation(() => {
    const result = queue.shift() ?? []
    return {
      from() {
        return this
      },
      where() {
        return Promise.resolve(result)
      },
    }
  })
}

describe('/api/admin/reindex', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({ ctx: { workspaceId: WORKSPACE_ID, userId: USER_ID }, error: null })
    mockRequireWorkspaceAdmin.mockResolvedValue(null)
    mockIsIndexable.mockImplementation((mime: string) => mime === 'application/pdf')
    mockInngestSend.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('pending 添付は file/uploaded の再投入対象から除外する', async () => {
    mockSelectResults(
      [
        { id: 'file-ready', mimeType: 'application/pdf', storagePath: 'path/ready.pdf', metadata: {} },
        { id: 'file-pending', mimeType: 'application/pdf', storagePath: 'path/pending.pdf', metadata: { pendingChannelId: 'channel-1' } },
      ],
      [{ userId: 'user-2' }],
      [{ id: 'project-1' }],
    )

    const { POST } = await import('./route')
    const res = await POST()

    expect(res.status).toBe(200)
    expect(mockInngestSend).toHaveBeenCalledWith([
      {
        name: 'file/uploaded',
        data: {
          fileId: 'file-ready',
          workspaceId: WORKSPACE_ID,
          mimeType: 'application/pdf',
          storagePath: 'path/ready.pdf',
        },
      },
      {
        name: 'member/upserted',
        data: { userId: 'user-2', workspaceId: WORKSPACE_ID },
      },
      {
        name: 'project/upserted',
        data: { projectId: 'project-1', workspaceId: WORKSPACE_ID },
      },
    ])

    await expect(res.json()).resolves.toEqual({
      queued: { files: 1, members: 1, projects: 1 },
    })
  })
})
