// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAuthContext,
  mockRequireWorkspaceAdmin,
  mockDbSelect,
  mockEq,
  mockAnd,
  mockIsIndexable,
  mockInngestSend,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireWorkspaceAdmin: vi.fn(),
  mockDbSelect: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockIsIndexable: vi.fn((mimeType: string) => mimeType === 'application/pdf'),
  mockInngestSend: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireWorkspaceAdmin: mockRequireWorkspaceAdmin }))
vi.mock('@/lib/ai/extract-text', () => ({ isIndexable: mockIsIndexable }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))
vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect },
  files: { id: 'files.id', mimeType: 'files.mimeType', storagePath: 'files.storagePath', workspaceId: 'files.workspaceId' },
  profiles: { id: 'profiles.id', kind: 'profiles.kind' },
  workspaceMembers: { userId: 'workspaceMembers.userId', workspaceId: 'workspaceMembers.workspaceId' },
  projects: { id: 'projects.id', workspaceId: 'projects.workspaceId' },
}))
vi.mock('drizzle-orm', () => ({
  and: mockAnd,
  eq: mockEq,
}))

function selectChain(result: unknown[]) {
  const where = vi.fn().mockResolvedValue(result)
  const innerJoin = vi.fn().mockReturnValue({ where })
  const builder = {
    from: vi.fn().mockReturnValue({
      innerJoin,
      where,
    }),
  }
  return builder
}

describe('/api/admin/reindex', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'ws-1' },
      error: null,
    })
    mockRequireWorkspaceAdmin.mockResolvedValue(null)
    mockDbSelect
      .mockReturnValueOnce(selectChain([
        { id: 'file-1', mimeType: 'application/pdf', storagePath: 'ws-1/ch-1/file-1.pdf' },
        { id: 'file-2', mimeType: 'image/png', storagePath: 'ws-1/ch-1/file-2.png' },
      ]))
      .mockReturnValueOnce(selectChain([
        { userId: 'human-1' },
        { userId: 'human-2' },
      ]))
      .mockReturnValueOnce(selectChain([
        { id: 'project-1' },
      ]))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('human メンバーだけを member/upserted の再インデックス対象に含める', async () => {
    const { POST } = await import('./route')
    const res = await POST()

    expect(res.status).toBe(200)
    expect(mockEq).toHaveBeenCalledWith('profiles.kind', 'human')
    expect(mockInngestSend).toHaveBeenCalledWith([
      {
        name: 'file/uploaded',
        data: { fileId: 'file-1', workspaceId: 'ws-1', mimeType: 'application/pdf', storagePath: 'ws-1/ch-1/file-1.pdf' },
      },
      {
        name: 'member/upserted',
        data: { userId: 'human-1', workspaceId: 'ws-1' },
      },
      {
        name: 'member/upserted',
        data: { userId: 'human-2', workspaceId: 'ws-1' },
      },
      {
        name: 'project/upserted',
        data: { projectId: 'project-1', workspaceId: 'ws-1' },
      },
    ])
    expect(mockAnd).toHaveBeenCalledTimes(1)
  })
})
