// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MSG_A = '11111111-1111-4111-8111-111111111111'
const MSG_B = '22222222-2222-4222-8222-222222222222'
const THREAD = '33333333-3333-4333-8333-333333333333'

const {
  mockGetAuthContext,
  mockRequireRole,
  mockRequireChannelAccess,
  state,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireRole: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  state: {
    // db.select（トランザクション外）の結果キュー
    outerSelects: [] as unknown[][],
    // tx.select の結果キュー（呼ばれた順）
    txSelects: [] as unknown[][],
    // tx.insert / tx.update の returning の結果キュー
    txInserts: [] as unknown[][],
    txUpdates: [] as unknown[][],
    executed: [] as string[],
    inserted: [] as Array<{ table: unknown; values: unknown }>,
    updated: [] as Array<{ table: unknown; set: unknown }>,
  },
}))

function chain(queue: unknown[][]) {
  const result = () => queue.shift() ?? []
  const proxy: unknown = new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve, reject)
      }
      return () => proxy
    },
    apply: () => proxy,
  })
  return proxy
}

function writeChain(queue: unknown[][], onWrite: (kind: 'values' | 'set', value: unknown) => void) {
  const proxy: unknown = new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(queue.shift() ?? []).then(resolve, reject)
      }
      if (prop === 'values' || prop === 'set') {
        return (value: unknown) => {
          onWrite(prop, value)
          return proxy
        }
      }
      return () => proxy
    },
  })
  return proxy
}

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireRole: mockRequireRole,
  requireChannelAccess: mockRequireChannelAccess,
}))
vi.mock('@cairn/db', () => {
  const tx = {
    select: () => chain(state.txSelects),
    insert: (table: unknown) =>
      writeChain(state.txInserts, (_kind, values) => state.inserted.push({ table, values })),
    update: (table: unknown) =>
      writeChain(state.txUpdates, (_kind, set) => state.updated.push({ table, set })),
    execute: (query: { text: string }) => {
      state.executed.push(query.text)
      return Promise.resolve([])
    },
  }
  return {
    db: {
      select: () => chain(state.outerSelects),
      transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    },
    channels: { id: 'channels.id', name: 'channels.name', workspaceId: 'channels.workspaceId', type: 'channels.type', parentChannelId: 'channels.parentChannelId', isPrivate: 'channels.isPrivate' },
    channelMembers: { channelId: 'cm.channelId', userId: 'cm.userId' },
    messages: { id: 'messages.id', channelId: 'messages.channelId', createdAt: 'messages.createdAt', deletedAt: 'messages.deletedAt', messageType: 'messages.messageType' },
    tasks: { sourceMessageId: 'tasks.sourceMessageId', channelId: 'tasks.channelId' },
    profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
    workspaceMembers: { userId: 'wm.userId', workspaceId: 'wm.workspaceId', displayName: 'wm.displayName' },
  }
})
vi.mock('drizzle-orm', () => {
  const op = () => 'op'
  const sql = (strings: TemplateStringsArray) => ({ text: strings.join('?') })
  return { and: op, asc: op, eq: op, gt: op, gte: op, inArray: op, isNull: op, ne: op, or: op, sql }
})

const routeContext = { params: Promise.resolve({ channelId: 'channel-1' }) }

function request(body: unknown) {
  return new Request('http://localhost/api/channels/channel-1/move-to-thread', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const parentRow = { id: 'channel-1', workspaceId: 'workspace-1', type: 'workspace', isPrivate: false, parentChannelId: null }

/** 新規スレッドへ 2 件を移す正常系の tx 結果を仕込む */
function arrangeNewThread() {
  state.outerSelects.push([parentRow])
  state.txSelects.push(
    [{ id: 'channel-1' }], // 親行ロック
    [{ id: MSG_A }, { id: MSG_B }], // 指定メッセージの検証
    [{ userId: 'user-1' }, { userId: 'user-2' }], // 親のメンバー
    [{ displayName: '田中' }], // 実行者名
  )
  state.txInserts.push([{ id: THREAD }])
  state.txUpdates.push([{ id: MSG_A }, { id: MSG_B }])
}

describe('メッセージのスレッドへの切り出し', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'member' },
      error: null,
    })
    mockRequireRole.mockReturnValue(null)
    mockRequireChannelAccess.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    state.outerSelects.length = 0
    state.txSelects.length = 0
    state.txInserts.length = 0
    state.txUpdates.length = 0
    state.executed.length = 0
    state.inserted.length = 0
    state.updated.length = 0
  })

  it('メンバー未満のロールは権限エラーになり何も変更しない', async () => {
    const forbidden = Response.json({ error: 'ゲストはスレッドに切り出せません' }, { status: 403 })
    mockRequireRole.mockReturnValue(forbidden)
    const { POST } = await import('./route')

    const response = await POST(request({ messageIds: [MSG_A], threadName: '相談' }), routeContext)

    expect(response.status).toBe(403)
    expect(mockRequireRole).toHaveBeenCalledWith('member', 'member')
    expect(state.executed).toHaveLength(0)
  })

  it('アクセスできないプライベートチャンネルからは切り出せない', async () => {
    mockRequireChannelAccess.mockResolvedValue(Response.json({ error: 'このチャンネルにアクセスする権限がありません' }, { status: 403 }))
    const { POST } = await import('./route')

    const response = await POST(request({ messageIds: [MSG_A], threadName: '相談' }), routeContext)

    expect(response.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith('workspace-1', 'user-1', 'channel-1', 'member')
    expect(state.inserted).toHaveLength(0)
  })

  it('移動先の既存スレッドにアクセスできなければ拒否する', async () => {
    mockRequireChannelAccess
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(Response.json({ error: 'このチャンネルにアクセスする権限がありません' }, { status: 403 }))
    const { POST } = await import('./route')

    const response = await POST(request({ messageIds: [MSG_A], threadId: THREAD }), routeContext)

    expect(response.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenLastCalledWith('workspace-1', 'user-1', THREAD, 'member')
    expect(state.updated).toHaveLength(0)
  })

  it('範囲指定と移動先の組み合わせが不正なら 400 にする', async () => {
    const { POST } = await import('./route')

    expect((await POST(request({ threadName: '相談' }), routeContext)).status).toBe(400)
    expect((await POST(request({ messageIds: [MSG_A] }), routeContext)).status).toBe(400)
    expect((await POST(request({ messageIds: [MSG_A], fromMessageId: MSG_B, threadName: '相談' }), routeContext)).status).toBe(400)
    expect((await POST(request({ messageIds: ['x'], threadName: '相談' }), routeContext)).status).toBe(400)
  })

  it('スレッド名が空または61文字以上なら 400 にする', async () => {
    const { POST } = await import('./route')

    const empty = await POST(request({ messageIds: [MSG_A], threadName: '  ' }), routeContext)
    const long = await POST(request({ messageIds: [MSG_A], threadName: 'あ'.repeat(61) }), routeContext)

    expect(empty.status).toBe(400)
    expect(long.status).toBe(400)
    await expect(long.json()).resolves.toEqual({ error: 'スレッド名は1〜60文字で入力してください' })
  })

  it('501件以上のメッセージ指定は 400 にする', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    const { POST } = await import('./route')

    const response = await POST(request({ messageIds: ids, threadName: '相談' }), routeContext)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: '一度にスレッドへ切り出せるのは500件までです' })
  })

  it('「以降すべて」が500件を超える場合は 400 にしてスレッドを作らない', async () => {
    state.outerSelects.push([parentRow])
    state.txSelects.push(
      [{ id: 'channel-1' }],
      [{ id: MSG_A, createdAt: new Date() }],
      Array.from({ length: 501 }, (_, i) => ({ id: `m-${i}` })),
    )
    const { POST } = await import('./route')

    const response = await POST(request({ fromMessageId: MSG_A, threadName: '相談' }), routeContext)

    expect(response.status).toBe(400)
    expect(state.inserted).toHaveLength(0)
    expect(state.executed).toHaveLength(0)
  })

  it('存在しない親チャンネルは 404 にする', async () => {
    state.outerSelects.push([])
    const { POST } = await import('./route')

    const response = await POST(request({ messageIds: [MSG_A], threadName: '相談' }), routeContext)

    expect(response.status).toBe(404)
  })

  it('スレッドの中のメッセージは別のスレッドへ切り出せない', async () => {
    state.outerSelects.push([{ ...parentRow, parentChannelId: 'parent-0' }])
    const { POST } = await import('./route')

    const response = await POST(request({ messageIds: [MSG_A], threadName: '相談' }), routeContext)

    expect(response.status).toBe(400)
    expect(state.inserted).toHaveLength(0)
  })

  it('プロジェクトチャンネルやDMからは切り出せない', async () => {
    state.outerSelects.push([{ ...parentRow, type: 'project' }])
    const { POST } = await import('./route')

    const response = await POST(request({ messageIds: [MSG_A], threadName: '相談' }), routeContext)

    expect(response.status).toBe(400)
  })

  it('削除済み・システム・他チャンネルのメッセージが含まれると 400 にする', async () => {
    state.outerSelects.push([parentRow])
    // 2件指定したが、条件に合致したのは1件だけ
    state.txSelects.push([{ id: 'channel-1' }], [{ id: MSG_A }])
    const { POST } = await import('./route')

    const response = await POST(request({ messageIds: [MSG_A, MSG_B], threadName: '相談' }), routeContext)

    expect(response.status).toBe(400)
    expect(state.inserted).toHaveLength(0)
    expect(state.updated).toHaveLength(0)
  })

  it('「以降すべて」の起点が移動できないメッセージなら 400 にする', async () => {
    state.outerSelects.push([parentRow])
    state.txSelects.push([{ id: 'channel-1' }], [])
    const { POST } = await import('./route')

    const response = await POST(request({ fromMessageId: MSG_A, threadName: '相談' }), routeContext)

    expect(response.status).toBe(400)
  })

  it('新規スレッドを作り、親のメンバーを引き継いでメッセージを移す', async () => {
    arrangeNewThread()
    const { POST } = await import('./route')

    const response = await POST(request({ messageIds: [MSG_A, MSG_B], threadName: ' 相談 ' }), routeContext)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ threadId: THREAD, movedCount: 2 })
    const [thread, members, systemMessage] = state.inserted
    expect(thread?.values).toMatchObject({ parentChannelId: 'channel-1', type: 'workspace', name: '相談', isPrivate: false })
    expect(members?.values).toEqual([{ channelId: THREAD, userId: 'user-1' }, { channelId: THREAD, userId: 'user-2' }])
    expect(systemMessage?.values).toMatchObject({
      channelId: 'channel-1',
      senderId: 'user-1',
      messageType: 'system',
      content: '田中さんが2件のメッセージを ┗相談 に移動しました',
    })
    expect(state.updated[0]?.set).toEqual({ channelId: THREAD })
    expect(state.updated[1]?.set).toEqual({ channelId: THREAD })
  })

  it('付随データ（通知・通報・AIナッジ・既読位置・巡回位置）を同じトランザクションで付け替える', async () => {
    arrangeNewThread()
    const { POST } = await import('./route')

    await POST(request({ messageIds: [MSG_A, MSG_B], threadName: '相談' }), routeContext)

    const sqlText = state.executed.join('\n')
    expect(sqlText).toContain('UPDATE notifications')
    expect(sqlText).toContain("jsonb_set(data, '{channelId}'")
    expect(sqlText).toContain('UPDATE content_reports')
    expect(sqlText).toContain('UPDATE ai_nudges')
    expect(sqlText).toContain('INSERT INTO channel_read_states')
    expect(sqlText).toContain('least(channel_read_states.last_read_at, excluded.last_read_at)')
    expect(sqlText).toContain('SET unread_mention_count')
    expect(sqlText).toContain('INSERT INTO ai_scan_states')
    // メンション未読数は付け替えた通知を数えるため、通知の更新より後に再計算する
    expect(sqlText.indexOf('UPDATE notifications')).toBeLessThan(sqlText.indexOf('SET unread_mention_count'))
  })

  it('非公開の親から作るスレッドは非公開のままにする', async () => {
    arrangeNewThread()
    state.outerSelects.length = 0
    state.outerSelects.push([{ ...parentRow, isPrivate: true }])
    const { POST } = await import('./route')

    await POST(request({ messageIds: [MSG_A, MSG_B], threadName: '相談' }), routeContext)

    expect(state.inserted[0]?.values).toMatchObject({ isPrivate: true })
  })

  it('既存スレッドへ移す場合は新しいスレッドを作らない', async () => {
    state.outerSelects.push([parentRow])
    state.txSelects.push(
      [{ id: 'channel-1' }],
      [{ id: MSG_A }],
      [{ id: THREAD, name: '既存', workspaceId: 'workspace-1', type: 'workspace', parentChannelId: 'channel-1', archived: false }],
      [{ displayName: '田中' }],
    )
    state.txUpdates.push([{ id: MSG_A }])
    const { POST } = await import('./route')

    const response = await POST(request({ messageIds: [MSG_A], threadId: THREAD }), routeContext)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ threadId: THREAD, movedCount: 1 })
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]?.values).toMatchObject({ messageType: 'system', content: '田中さんが1件のメッセージを ┗既存 に移動しました' })
  })

  it('別の親のスレッドへは移せない', async () => {
    state.outerSelects.push([parentRow])
    state.txSelects.push(
      [{ id: 'channel-1' }],
      [{ id: MSG_A }],
      [{ id: THREAD, name: '他所', workspaceId: 'workspace-1', type: 'workspace', parentChannelId: 'channel-2', archived: false }],
    )
    const { POST } = await import('./route')

    const response = await POST(request({ messageIds: [MSG_A], threadId: THREAD }), routeContext)

    expect(response.status).toBe(400)
    expect(state.updated).toHaveLength(0)
  })

  it('アーカイブ済みのスレッドへは移せない', async () => {
    state.outerSelects.push([parentRow])
    state.txSelects.push(
      [{ id: 'channel-1' }],
      [{ id: MSG_A }],
      [{ id: THREAD, name: '済', workspaceId: 'workspace-1', type: 'workspace', parentChannelId: 'channel-1', archived: true }],
    )
    const { POST } = await import('./route')

    const response = await POST(request({ messageIds: [MSG_A], threadId: THREAD }), routeContext)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'アーカイブ済みのスレッドには移動できません' })
  })

  it('存在しない移動先スレッドは 404 にする', async () => {
    state.outerSelects.push([parentRow])
    state.txSelects.push([{ id: 'channel-1' }], [{ id: MSG_A }], [])
    const { POST } = await import('./route')

    const response = await POST(request({ messageIds: [MSG_A], threadId: THREAD }), routeContext)

    expect(response.status).toBe(404)
  })

  it('更新できた件数が対象と食い違えば競合として 409 にする', async () => {
    arrangeNewThread()
    state.txUpdates.length = 0
    state.txUpdates.push([{ id: MSG_A }])
    const { POST } = await import('./route')

    const response = await POST(request({ messageIds: [MSG_A, MSG_B], threadName: '相談' }), routeContext)

    expect(response.status).toBe(409)
  })
})
