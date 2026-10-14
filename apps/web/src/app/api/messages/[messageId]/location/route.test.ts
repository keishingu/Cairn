// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockCanAccessChannel, mockDbSelect } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockCanAccessChannel: vi.fn(),
  mockDbSelect: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ canAccessChannel: mockCanAccessChannel }))
vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect },
  messages: { id: 'messages.id', channelId: 'messages.channelId', deletedAt: 'messages.deletedAt' },
}))
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), isNull: vi.fn() }))

const MESSAGE_ID = '11111111-1111-4111-8111-111111111111'
const routeContext = { params: Promise.resolve({ messageId: MESSAGE_ID }) }

function selectResult(result: unknown[]) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  })
}

describe('メッセージの現在地の取得', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'member' },
      error: null,
    })
    mockCanAccessChannel.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('閲覧できるチャンネルにあるメッセージはチャンネル ID を返す', async () => {
    selectResult([{ channelId: 'thread-1' }])
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/messages/message-1/location'), routeContext)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ channelId: 'thread-1' })
    expect(mockCanAccessChannel).toHaveBeenCalledWith('workspace-1', 'user-1', 'thread-1', 'member')
  })

  it('閲覧できないチャンネルのメッセージは存在を隠して 404 にする', async () => {
    selectResult([{ channelId: 'private-thread' }])
    mockCanAccessChannel.mockResolvedValue(false)
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/messages/message-1/location'), routeContext)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.not.toHaveProperty('channelId')
  })

  it('存在しない、または削除済みのメッセージは 404 にする', async () => {
    selectResult([])
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/messages/message-1/location'), routeContext)

    expect(response.status).toBe(404)
    expect(mockCanAccessChannel).not.toHaveBeenCalled()
  })

  it('UUID でない ID は DB に問い合わせず 404 にする', async () => {
    const { GET } = await import('./route')

    const response = await GET(
      new Request('http://localhost/api/messages/not-a-uuid/location'),
      { params: Promise.resolve({ messageId: 'not-a-uuid' }) },
    )

    expect(response.status).toBe(404)
    expect(mockDbSelect).not.toHaveBeenCalled()
  })
})
