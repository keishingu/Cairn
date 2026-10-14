// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const MESSAGE_ID = '20000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '40000000-0000-0000-0000-000000000001'
const PROJECT_ID = '50000000-0000-0000-0000-000000000001'
const TASK_ID = '30000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockHasTaskChannelSchema,
  mockHasTaskSourceLineSchema,
  mockBuildMentionNameMap,
  mockSelectLimit,
  mockSelectOrdered,
  mockInsertValues,
  mockInsertReturning,
  mockLockMessage,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockHasTaskChannelSchema: vi.fn(),
  mockHasTaskSourceLineSchema: vi.fn(),
  mockBuildMentionNameMap: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockSelectOrdered: vi.fn(),
  mockInsertValues: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockLockMessage: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/tasks/schema-readiness', () => ({ hasTaskChannelSchema: mockHasTaskChannelSchema, hasTaskSourceLineSchema: mockHasTaskSourceLineSchema }))
vi.mock('@/lib/chat/mention-name-map', () => ({ buildMentionNameMap: mockBuildMentionNameMap }))
vi.mock('@/lib/workspace-member-display-name', () => ({ workspaceMemberDisplayName: vi.fn(() => 'displayName') }))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  isNull: vi.fn(() => 'isNull'),
  asc: vi.fn(() => 'asc'),
  inArray: vi.fn(() => 'inArray'),
}))
vi.mock('@cairn/db', () => {
  const column = (name: string) => name
  const messages = { id: column('messages.id'), content: column('messages.content'), messageType: column('messages.messageType'), channelId: column('messages.channelId'), deletedAt: column('messages.deletedAt') }
  const channels = { id: column('channels.id'), workspaceId: column('channels.workspaceId'), projectId: column('channels.projectId'), name: column('channels.name'), type: column('channels.type'), isPrivate: column('channels.isPrivate') }
  const tasks = { id: column('tasks.id'), workspaceId: column('tasks.workspaceId'), title: column('tasks.title'), status: column('tasks.status'), sourceCheckboxIndex: column('tasks.sourceCheckboxIndex'), sourceMessageId: column('tasks.sourceMessageId'), sourceLine: column('tasks.sourceLine'), description: column('tasks.description'), createdAt: column('tasks.createdAt') }
  const projects = { id: column('projects.id'), title: column('projects.title') }
  const profiles = { id: column('profiles.id'), displayName: column('profiles.displayName') }
  const workspaceMembers = { userId: column('wm.userId'), workspaceId: column('wm.workspaceId'), displayName: column('wm.displayName'), avatarUrl: column('wm.avatarUrl') }
  // どのチェーンも同じオブジェクトを返し、limit() で結果を取り出す
  const chain: Record<string, unknown> = {}
  for (const method of ['from', 'innerJoin', 'leftJoin', 'where']) chain[method] = () => chain
  // メッセージ取得は limit()、タスク一覧は orderBy() の await で結果を取り出す
  chain['limit'] = (...args: unknown[]) => mockSelectLimit(...args)
  chain['orderBy'] = () => ({ then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(mockSelectOrdered()).then(resolve, reject) })
  const insert = vi.fn(() => ({ values: (v: unknown) => { mockInsertValues(v); return { onConflictDoNothing: () => ({ returning: mockInsertReturning }) } } }))
  // トランザクション内の select は for('update') で行ロックしたメッセージを返す
  const lockChain: Record<string, unknown> = {}
  for (const method of ['from', 'where']) lockChain[method] = () => lockChain
  lockChain['for'] = (...args: unknown[]) => mockLockMessage(...args)
  const tx = { select: vi.fn(() => lockChain), insert }
  const db = {
    select: vi.fn(() => chain),
    insert,
    transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  }
  return { db, messages, channels, tasks, projects, profiles, workspaceMembers }
})

const messageRow = {
  id: MESSAGE_ID,
  content: '- [ ] 資料を確認する\n- 日程を調整する\n詳細は後で',
  messageType: 'text',
  channelId: CHANNEL_ID,
  projectId: PROJECT_ID,
}

// sourceLine 省略時は作成時のまま（title と同じ）。タスク名を後から変えた場合は明示する。
const taskRow = (
  id: string,
  title: string,
  status = 'todo',
  sourceCheckboxIndex: number | null = null,
  sourceLine: string | null = sourceCheckboxIndex == null ? title : null,
) => ({
  id,
  title,
  status,
  sourceCheckboxIndex,
  sourceLine,
})

const routeParams = { params: Promise.resolve({ messageId: MESSAGE_ID }) }

async function callGet() {
  const { GET } = await import('./route')
  return GET(new Request(`http://localhost/api/messages/${MESSAGE_ID}/task`), routeParams)
}

async function callPost(body?: unknown, rawBody?: string) {
  const { POST } = await import('./route')
  const init: RequestInit = { method: 'POST' }
  if (rawBody !== undefined) init.body = rawBody
  else if (body !== undefined) init.body = JSON.stringify(body)
  return POST(new Request(`http://localhost/api/messages/${MESSAGE_ID}/task`, init), routeParams)
}

beforeEach(() => {
  mockGetAuthContext.mockResolvedValue({
    ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'member' },
    error: null,
  })
  mockRequireChannelAccess.mockResolvedValue(null)
  mockLockMessage.mockResolvedValue([{ id: MESSAGE_ID, content: messageRow.content }])
  mockHasTaskChannelSchema.mockResolvedValue(true)
  mockHasTaskSourceLineSchema.mockResolvedValue(true)
  mockBuildMentionNameMap.mockResolvedValue(new Map())
  mockInsertReturning.mockResolvedValue([{ id: TASK_ID }])
})

afterEach(() => {
  vi.clearAllMocks()
  // 未消費の mockResolvedValueOnce を次のテストへ持ち越さない
  for (const mock of [mockSelectLimit, mockSelectOrdered, mockLockMessage, mockInsertReturning]) mock.mockReset()
})

describe('GET /api/messages/[messageId]/task', () => {
  it('メッセージが見つからなければ 404 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([])

    expect((await callGet()).status).toBe(404)
  })

  it('チャンネルにアクセスできなければ 403 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockRequireChannelAccess.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))

    expect((await callGet()).status).toBe(403)
  })

  it('source_line 用スキーマが未適用なら 503 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockHasTaskSourceLineSchema.mockResolvedValue(false)

    const response = await callGet()

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'タスク化の準備中です' })
  })

  it('タスク名を変えていても、元の行で作成済みと判定する', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockSelectOrdered.mockResolvedValueOnce([
      taskRow(TASK_ID, '資料を最優先で確認', 'todo', null, '資料を確認する'),
      // 元の行が別でも、タイトルが偶然一致しただけでは作成済みにしない
      taskRow('30000000-0000-0000-0000-000000000008', '日程を調整する', 'todo', null, '別の行'),
    ])

    const body = await (await callGet()).json()

    expect(body.candidates).toEqual([
      { line: '資料を確認する', title: '資料を確認する', isListItem: true, taskId: TASK_ID },
      { line: '日程を調整する', title: '日程を調整する', isListItem: true, taskId: null },
      { line: '詳細は後で', title: '詳細は後で', isListItem: false, taskId: null },
    ])
    expect(body.tasks[0]).toEqual({ id: TASK_ID, title: '資料を最優先で確認', status: 'todo', sourceLine: '資料を確認する' })
  })

  it('各行を候補にし、同じ行で作成済みの行には taskId を付ける', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockSelectOrdered.mockResolvedValueOnce([
      taskRow(TASK_ID, '資料を確認する', 'done'),
      taskRow('30000000-0000-0000-0000-000000000009', '資料を確認する', 'todo', 2),
    ])

    const response = await callGet()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      candidates: [
        { line: '資料を確認する', title: '資料を確認する', isListItem: true, taskId: TASK_ID },
        { line: '日程を調整する', title: '日程を調整する', isListItem: true, taskId: null },
        { line: '詳細は後で', title: '詳細は後で', isListItem: false, taskId: null },
      ],
      tasks: [
        { id: TASK_ID, title: '資料を確認する', status: 'done', sourceLine: '資料を確認する' },
        { id: '30000000-0000-0000-0000-000000000009', title: '資料を確認する', status: 'todo', sourceLine: null },
      ],
    })
  })
})

describe('POST /api/messages/[messageId]/task', () => {
  it('メッセージが見つからなければ 404 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([])

    const response = await callPost({ items: [{ line: '詳細は後で', title: 'a' }] })

    expect(response.status).toBe(404)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('システムメッセージは 404 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ ...messageRow, messageType: 'system' }])

    const response = await callPost({ items: [{ line: '詳細は後で', title: 'a' }] })

    expect(response.status).toBe(404)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('チャンネルにアクセスできなければ 403 を返しタスクを作らない', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockRequireChannelAccess.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))

    const response = await callPost({ items: [{ line: '詳細は後で', title: 'a' }] })

    expect(response.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, CHANNEL_ID, 'member')
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('チャンネルタスク用スキーマが未適用なら 503 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockHasTaskChannelSchema.mockResolvedValue(false)

    const response = await callPost({ items: [{ line: '詳細は後で', title: 'a' }] })

    expect(response.status).toBe(503)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it.each([
    ['items が無い', { }],
    ['旧形式の titles', { titles: ['資料を確認する'] }],
    ['items が空配列', { items: [] }],
    ['items が 51 件', { items: Array.from({ length: 51 }, (_, i) => ({ line: `l${i}`, title: `t${i}` })) }],
    ['空文字のタイトル', { items: [{ line: '資料を確認する', title: '' }] }],
    ['空白だけのタイトル', { items: [{ line: '資料を確認する', title: '  ' }] }],
    ['201 文字のタイトル', { items: [{ line: '資料を確認する', title: 'あ'.repeat(201) }] }],
    ['line が無い', { items: [{ title: '資料を確認する' }] }],
    ['空白だけの line', { items: [{ line: '  ', title: '資料を確認する' }] }],
    ['文字列でないタイトル', { items: [{ line: '資料を確認する', title: 1 }] }],
  ])('%s なら 422 を返し何も作らない', async (_name, body) => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])

    const response = await callPost(body)

    expect(response.status).toBe(422)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('source_line 用スキーマが未適用なら 503 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockHasTaskSourceLineSchema.mockResolvedValue(false)

    const response = await callPost({ items: [{ line: '資料を確認する', title: '資料を確認する' }] })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'タスク化の準備中です' })
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('現在の本文の候補にない line は 422 を返し何も作らない', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])

    const response = await callPost({
      items: [
        { line: '資料を確認する', title: '資料を確認する' },
        { line: '本文にない行', title: '本文にない行' },
      ],
    })

    expect(response.status).toBe(422)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('タスク名を編集して作成すると line を source_line に保存し、その行が作成済みになる', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockSelectOrdered.mockResolvedValueOnce([taskRow(TASK_ID, '資料を今日中に確認', 'todo', null, '資料を確認する')])

    const response = await callPost({ items: [{ line: '資料を確認する', title: '資料を今日中に確認' }] })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      tasks: [{ id: TASK_ID, title: '資料を今日中に確認', status: 'todo' }],
      createdCount: 1,
    })
    expect(mockInsertValues).toHaveBeenCalledWith([
      expect.objectContaining({ title: '資料を今日中に確認', sourceLine: '資料を確認する' }),
    ])

    // 作成後の GET では、タスク名が違っても元の行が作成済みになる
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockSelectOrdered.mockResolvedValueOnce([taskRow(TASK_ID, '資料を今日中に確認', 'todo', null, '資料を確認する')])
    const body = await (await callGet()).json()
    expect(body.candidates[0]).toEqual({ line: '資料を確認する', title: '資料を確認する', isListItem: true, taskId: TASK_ID })
  })

  it('同じ line の再要求はタイトルが違っても作らず、既存のタスクを createdCount 0 で返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockInsertReturning.mockResolvedValue([])
    mockSelectOrdered.mockResolvedValueOnce([taskRow(TASK_ID, '資料を今日中に確認', 'done', null, '資料を確認する')])

    const response = await callPost({ items: [{ line: '資料を確認する', title: '別の名前' }] })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      tasks: [{ id: TASK_ID, title: '資料を今日中に確認', status: 'done' }],
      createdCount: 0,
    })
  })

  it('ロック下の本文が編集されて line が無ければ 409 を返し、挿入しない', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockLockMessage.mockResolvedValueOnce([{ id: MESSAGE_ID, content: '- [ ] 別の内容に編集した' }])

    const response = await callPost({ items: [{ line: '資料を確認する', title: '資料を確認する' }] })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'メッセージが編集されたため、もう一度選び直してください' })
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('メンションを含む行は、表示名ではなく <@id> の line で照合・保存する', async () => {
    const content = `- <@${USER_ID}> 確認をお願い`
    const line = `<@${USER_ID}> 確認をお願い`
    mockBuildMentionNameMap.mockResolvedValue(new Map([[USER_ID, '山田']]))
    mockSelectLimit.mockResolvedValueOnce([{ ...messageRow, content }])
    mockLockMessage.mockResolvedValueOnce([{ id: MESSAGE_ID, content }])
    mockSelectOrdered.mockResolvedValueOnce([taskRow(TASK_ID, '@山田 確認をお願い', 'todo', null, line)])

    const response = await callPost({ items: [{ line, title: '@山田 確認をお願い' }] })

    expect(response.status).toBe(201)
    expect(mockInsertValues).toHaveBeenCalledWith([expect.objectContaining({ title: '@山田 確認をお願い', sourceLine: line })])
  })

  it('JSON として不正な body は 422 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])

    const response = await callPost(undefined, '{oops')

    expect(response.status).toBe(422)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('作成後の読み直しまでにメッセージが削除されタスクが消えていたら 404 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockInsertReturning.mockResolvedValue([{ id: TASK_ID }])
    mockSelectOrdered.mockResolvedValueOnce([])

    const response = await callPost({ items: [{ line: '資料を確認する', title: '資料を確認する' }] })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'メッセージが見つかりません' })
  })

  it('items の数だけ一括で作成し、要求順にタスクを 201 で返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockInsertReturning.mockResolvedValue([{ id: TASK_ID }, { id: 'task-2' }])
    mockSelectOrdered.mockResolvedValueOnce([
      taskRow('task-2', '日程をいい感じに調整', 'todo', null, '日程を調整する'),
      taskRow(TASK_ID, '資料を確認する'),
    ])

    const response = await callPost({
      items: [
        { line: '資料を確認する', title: '資料を確認する' },
        { line: '  日程を調整する  ', title: '  日程をいい感じに調整  ' },
        { line: '資料を確認する', title: '重複は無視' },
      ],
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      tasks: [
        { id: TASK_ID, title: '資料を確認する', status: 'todo' },
        { id: 'task-2', title: '日程をいい感じに調整', status: 'todo' },
      ],
      createdCount: 2,
    })
    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    expect(mockInsertValues).toHaveBeenCalledWith([
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        channelId: CHANNEL_ID,
        title: '資料を確認する',
        sourceLine: '資料を確認する',
        priority: 'medium',
        status: 'todo',
        createdBy: USER_ID,
        sourceMessageId: MESSAGE_ID,
        assigneeId: null,
      }),
      expect.objectContaining({ title: '日程をいい感じに調整', sourceLine: '日程を調整する' }),
    ])
  })

  it('一部が作成済みなら新規分だけ createdCount に数え、既存のタスクも返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockInsertReturning.mockResolvedValue([{ id: 'task-2' }])
    mockSelectOrdered.mockResolvedValueOnce([
      taskRow(TASK_ID, '資料を確認する', 'done'),
      taskRow('task-2', '日程を調整する'),
    ])

    const response = await callPost({
      items: [
        { line: '資料を確認する', title: '資料を確認する' },
        { line: '日程を調整する', title: '日程を調整する' },
      ],
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      tasks: [
        { id: TASK_ID, title: '資料を確認する', status: 'done' },
        { id: 'task-2', title: '日程を調整する', status: 'todo' },
      ],
      createdCount: 1,
    })
  })

  it('すべて作成済みなら createdCount: 0 を 200 で返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockInsertReturning.mockResolvedValue([])
    mockSelectOrdered.mockResolvedValueOnce([taskRow(TASK_ID, '資料を確認する')])

    const response = await callPost({ items: [{ line: '資料を確認する', title: '資料を確認する' }] })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      tasks: [{ id: TASK_ID, title: '資料を確認する', status: 'todo' }],
      createdCount: 0,
    })
  })

  it('body なしなら後方互換として本文の最初の行1件を作る', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockSelectOrdered.mockResolvedValueOnce([taskRow(TASK_ID, '資料を確認する')])

    const response = await callPost()

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      tasks: [{ id: TASK_ID, title: '資料を確認する', status: 'todo' }],
      createdCount: 1,
    })
    expect(mockInsertValues).toHaveBeenCalledWith([expect.objectContaining({ title: '資料を確認する', sourceLine: '資料を確認する' })])
  })

  it('body なしで本文が空のメッセージは 422 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ ...messageRow, content: '  ' }])

    const response = await callPost()

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: '本文のないメッセージはタスクにできません' })
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('挿入前にメッセージが削除されていたら、タスクを作らず 404 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockLockMessage.mockResolvedValueOnce([])

    const response = await callPost({ items: [{ line: '資料を確認する', title: '資料を確認する' }] })

    expect(response.status).toBe(404)
    expect(mockLockMessage).toHaveBeenCalledWith('update')
    expect(mockInsertValues).not.toHaveBeenCalled()
  })
})
