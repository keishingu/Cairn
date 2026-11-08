// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test, vi } from 'vitest'

const { mockGetAuthContext } = vi.hoisted(() => ({ mockGetAuthContext: vi.fn() }))
vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ isWorkspaceAdmin: (role: string) => role === 'owner' || role === 'admin' }))
const { mockIdentityRows } = vi.hoisted(() => ({ mockIdentityRows: { value: [] as unknown[] } }))
vi.mock('@cairn/db', () => {
  const chain = { from: () => chain, where: () => chain, limit: () => Promise.resolve(mockIdentityRows.value) }
  return { db: { select: () => chain }, importIdentities: { id: 'id', workspaceId: 'workspaceId' } }
})
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }))

import { GET } from './route'

const ORIGINAL = process.env['IMPORT_OPERATOR_USER_IDS']

describe('GET /api/imports/access', () => {
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env['IMPORT_OPERATOR_USER_IDS']
    else process.env['IMPORT_OPERATOR_USER_IDS'] = ORIGINAL
  })

  test.each([
    ['owner', 'u1', true],
    ['admin', 'u1', true],
    ['owner', 'other', false],
    ['member', 'u1', false],
    ['guest', 'u1', false],
  ])('%s（運営者の一覧: %s）は allowed=%s', async (role, operators, allowed) => {
    process.env['IMPORT_OPERATOR_USER_IDS'] = operators
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: 'u1', workspaceId: 'ws1', role }, error: null })
    const res = await GET()
    await expect(res.json()).resolves.toMatchObject({ allowed })
  })

  test('取り込んだ投稿者がいれば、運営者でない owner / admin も紐づけ（canLink）ができる', async () => {
    process.env['IMPORT_OPERATOR_USER_IDS'] = 'someone-else'
    mockIdentityRows.value = [{ id: 'identity-1' }]
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: 'u1', workspaceId: 'ws1', role: 'admin' }, error: null })
    await expect((await GET()).json()).resolves.toEqual({ allowed: false, canLink: true })
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: 'u1', workspaceId: 'ws1', role: 'member' }, error: null })
    await expect((await GET()).json()).resolves.toEqual({ allowed: false, canLink: false })
    mockIdentityRows.value = []
  })
})
