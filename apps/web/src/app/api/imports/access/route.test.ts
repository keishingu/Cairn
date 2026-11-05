// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test, vi } from 'vitest'

const { mockGetAuthContext } = vi.hoisted(() => ({ mockGetAuthContext: vi.fn() }))
vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ isWorkspaceAdmin: (role: string) => role === 'owner' || role === 'admin' }))

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
    await expect(res.json()).resolves.toEqual({ allowed })
  })
})
