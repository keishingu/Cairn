import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockRequireChannelAccess, mockSelect, mockNe } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockSelect: vi.fn(),
  mockNe: vi.fn(() => 'ne'),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@cairn/db', () => ({
  db: { select: mockSelect },
  channelReadStates: {
    userId: 'channelReadStates.userId',
    channelId: 'channelReadStates.channelId',
    lastReadAt: 'channelReadStates.lastReadAt',
  },
  messages: {
    id: 'messages.id',
    channelId: 'messages.channelId',
    senderId: 'messages.senderId',
    createdAt: 'messages.createdAt',
    deletedAt: 'messages.deletedAt',
  },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  isNull: vi.fn(() => 'isNull'),
  gt: vi.fn(() => 'gt'),
  ne: mockNe,
  asc: vi.fn(() => 'asc'),
  desc: vi.fn(() => 'desc'),
  inArray: vi.fn(() => 'inArray'),
  sql: vi.fn(() => 'sql'),
}))

const context = { params: Promise.resolve({ channelId: 'channel-1' }) }

function mockSelectResults(...results: unknown[][]) {
  const queue = [...results]
  mockSelect.mockImplementation(() => {
    const result = queue.shift() ?? []
    const builder = {
      from: () => builder,
      where: () => builder,
      orderBy: () => builder,
      limit: () => Promise.resolve(result),
    }
    return builder
  })
}

describe('GET /api/channels/[channelId]/read', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'member' },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
  })

  it('未読がなければ末尾表示を示すnullを返す', async () => {
    mockSelectResults([])

    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/'), context)

    await expect(response.json()).resolves.toEqual({ messageId: null })
    expect(mockSelect).toHaveBeenCalledTimes(1)
  })

  it('未読があれば自分の投稿も含む既読境界直後のメッセージを返す', async () => {
    mockSelectResults([{ id: 'unread-message' }], [{ id: 'first-after-read' }])

    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/'), context)

    await expect(response.json()).resolves.toEqual({ messageId: 'first-after-read' })
    expect(mockNe).toHaveBeenCalledWith('messages.senderId', 'user-1')
  })

  it('アクセスできないチャンネルの既読位置を返さない', async () => {
    mockRequireChannelAccess.mockResolvedValue(new Response(null, { status: 403 }))

    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/'), context)

    expect(response.status).toBe(403)
    expect(mockSelect).not.toHaveBeenCalled()
  })
})
