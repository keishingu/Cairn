// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, test, vi } from 'vitest'

const { mockGetAuthContext, mockCreate, mockList } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockCreate: vi.fn(),
  mockList: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@cairn/db', () => ({ db: {} }))
vi.mock('@/lib/ai/automations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/automations')>()),
  createAutomation: mockCreate,
  listAutomations: mockList,
}))

function ctx(role: 'owner' | 'admin' | 'member' | 'guest') {
  return { ctx: { workspaceId: 'workspace-1', userId: 'user-1', role }, error: null }
}

describe('オートメーションの一覧・作成の権限', () => {
  beforeEach(() => vi.clearAllMocks())

  test('member は一覧を見られる', async () => {
    mockGetAuthContext.mockResolvedValue(ctx('member'))
    mockList.mockResolvedValue([])
    const { GET } = await import('./route')
    expect((await GET()).status).toBe(200)
  })

  test('guest は一覧を見られない', async () => {
    mockGetAuthContext.mockResolvedValue(ctx('guest'))
    const { GET } = await import('./route')
    expect((await GET()).status).toBe(403)
    expect(mockList).not.toHaveBeenCalled()
  })

  test('member は作成できず、admin は作成できる', async () => {
    const body = JSON.stringify({ kind: 'skill', name: 'assign-reviewer', instruction: '指示', writeActions: [] })
    const { POST } = await import('./route')

    mockGetAuthContext.mockResolvedValue(ctx('member'))
    expect((await POST(new Request('http://cairn.local/api/automations', { method: 'POST', body }))).status).toBe(403)
    expect(mockCreate).not.toHaveBeenCalled()

    mockGetAuthContext.mockResolvedValue(ctx('admin'))
    mockCreate.mockResolvedValue({ id: 'automation-1' })
    expect((await POST(new Request('http://cairn.local/api/automations', { method: 'POST', body }))).status).toBe(201)
  })

  test('上限や名前の重複はエラー文をそのまま返す', async () => {
    mockGetAuthContext.mockResolvedValue(ctx('admin'))
    const { AutomationError } = await import('@/lib/ai/automations')
    mockCreate.mockRejectedValue(new AutomationError(409, '$assign-reviewer はすでに使われています'))
    const { POST } = await import('./route')
    const response = await POST(new Request('http://cairn.local/api/automations', {
      method: 'POST',
      body: JSON.stringify({ kind: 'skill', name: 'assign-reviewer', instruction: '指示', writeActions: [] }),
    }))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: '$assign-reviewer はすでに使われています' })
  })
})
