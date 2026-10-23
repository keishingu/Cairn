// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const MESSAGE_ID = '20000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockSet,
  mockRequireChannelAccess,
  mockSelectLimit,
  mockToggleCheckboxAt,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockSet: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockToggleCheckboxAt: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/chat/checkboxes', () => ({ toggleCheckboxAt: mockToggleCheckboxAt }))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  inArray: vi.fn(() => 'inArray'),
  isNull: vi.fn(() => 'isNull'),
}))
vi.mock('@cairn/db', () => {
  const messages = {
    id: 'messages.id',
    content: 'messages.content',
    channelId: 'messages.channelId',
    deletedAt: 'messages.deletedAt',
  }
  const db = {
    select: vi.fn(() => ({
      from: () => ({ where: () => ({ limit: mockSelectLimit }) }),
    })),
    update: vi.fn(() => ({ set: (values: unknown) => { mockSet(values); return { where: vi.fn() } } })),
  }
  return { db, messages }
})

describe('PATCH /api/messages/[messageId]/checkbox', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockSelectLimit.mockResolvedValue([{ content: '- [ ] task', channelId: 'channel-1' }])
    mockToggleCheckboxAt.mockReturnValue('- [x] task')
  })

  afterEach(() => vi.clearAllMocks())

  it('メッセージ本文のチェックボックスだけを更新し、タスクやナッジには触れない', async () => {
    const { PATCH } = await import('./route')
    const response = await PATCH(new Request(`http://localhost/api/messages/${MESSAGE_ID}/checkbox`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ index: 0, checked: true }),
    }), { params: Promise.resolve({ messageId: MESSAGE_ID }) })

    expect(response.status).toBe(200)
    expect(mockToggleCheckboxAt).toHaveBeenCalledWith('- [ ] task', 0, true)
    expect(mockSet).toHaveBeenCalledOnce()
    expect(mockSet).toHaveBeenCalledWith({ content: '- [x] task' })
  })

  it('内容が変わらないときは更新しない', async () => {
    mockToggleCheckboxAt.mockReturnValue('- [ ] task')

    const { PATCH } = await import('./route')
    const response = await PATCH(new Request(`http://localhost/api/messages/${MESSAGE_ID}/checkbox`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ index: 0, checked: false }),
    }), { params: Promise.resolve({ messageId: MESSAGE_ID }) })

    expect(response.status).toBe(200)
    expect(mockSet).not.toHaveBeenCalled()
  })
})
