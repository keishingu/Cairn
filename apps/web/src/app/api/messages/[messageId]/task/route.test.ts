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
  mockBuildMentionNameMap,
  mockSelectLimit,
  mockInsertValues,
  mockInsertReturning,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockHasTaskChannelSchema: vi.fn(),
  mockBuildMentionNameMap: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockInsertValues: vi.fn(),
  mockInsertReturning: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/tasks/schema-readiness', () => ({ hasTaskChannelSchema: mockHasTaskChannelSchema }))
vi.mock('@/lib/chat/mention-name-map', () => ({ buildMentionNameMap: mockBuildMentionNameMap }))
vi.mock('@/lib/workspace-member-display-name', () => ({ workspaceMemberDisplayName: vi.fn(() => 'displayName') }))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  isNull: vi.fn(() => 'isNull'),
  asc: vi.fn(() => 'asc'),
}))
vi.mock('@cairn/db', () => {
  const column = (name: string) => name
  const messages = { id: column('messages.id'), content: column('messages.content'), messageType: column('messages.messageType'), channelId: column('messages.channelId'), deletedAt: column('messages.deletedAt') }
  const channels = { id: column('channels.id'), workspaceId: column('channels.workspaceId'), projectId: column('channels.projectId'), name: column('channels.name'), type: column('channels.type'), isPrivate: column('channels.isPrivate') }
  const tasks = { id: column('tasks.id'), workspaceId: column('tasks.workspaceId'), sourceMessageId: column('tasks.sourceMessageId'), createdAt: column('tasks.createdAt') }
  const projects = { id: column('projects.id'), title: column('projects.title') }
  const profiles = { id: column('profiles.id'), displayName: column('profiles.displayName') }
  const workspaceMembers = { userId: column('wm.userId'), workspaceId: column('wm.workspaceId'), displayName: column('wm.displayName'), avatarUrl: column('wm.avatarUrl') }
  // どのチェーンも同じオブジェクトを返し、limit() で結果を取り出す
  const chain: Record<string, unknown> = {}
  for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy']) chain[method] = () => chain
  chain['limit'] = (...args: unknown[]) => mockSelectLimit(...args)
  const db = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => ({ values: (v: unknown) => { mockInsertValues(v); return { returning: mockInsertReturning } } })),
  }
  return { db, messages, channels, tasks, projects, profiles, workspaceMembers }
})

const messageRow = {
  id: MESSAGE_ID,
  content: '- [ ] 資料を確認する\n詳細は後で',
  messageType: 'text',
  channelId: CHANNEL_ID,
  projectId: PROJECT_ID,
}

const taskRow = {
  id: TASK_ID,
  projectId: PROJECT_ID,
  projectTitle: 'Alpha',
  channelId: CHANNEL_ID,
  channelName: 'general',
  channelType: 'project',
  channelIsPrivate: false,
  title: '資料を確認する',
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  assigneeId: null,
  sourceMessageId: MESSAGE_ID,
  assigneeName: null,
  assigneeAvatarUrl: null,
}

async function callPost() {
  const { POST } = await import('./route')
  return POST(new Request(`http://localhost/api/messages/${MESSAGE_ID}/task`, { method: 'POST' }), {
    params: Promise.resolve({ messageId: MESSAGE_ID }),
  })
}

describe('POST /api/messages/[messageId]/task', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockHasTaskChannelSchema.mockResolvedValue(true)
    mockBuildMentionNameMap.mockResolvedValue(new Map())
    mockInsertReturning.mockResolvedValue([{ id: TASK_ID }])
  })

  afterEach(() => vi.clearAllMocks())

  it('メッセージが見つからなければ 404 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([])

    const response = await callPost()

    expect(response.status).toBe(404)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('システムメッセージは 404 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ ...messageRow, messageType: 'system' }])

    const response = await callPost()

    expect(response.status).toBe(404)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('チャンネルにアクセスできなければ 403 を返しタスクを作らない', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockRequireChannelAccess.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))

    const response = await callPost()

    expect(response.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, CHANNEL_ID, 'member')
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('チャンネルタスク用スキーマが未適用なら 503 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow])
    mockHasTaskChannelSchema.mockResolvedValue(false)

    const response = await callPost()

    expect(response.status).toBe(503)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('既にタスク化済みなら新規作成せず既存タスクを created: false で返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([messageRow]).mockResolvedValueOnce([taskRow])

    const response = await callPost()

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: TASK_ID, created: false, sourceMessageId: MESSAGE_ID, isLinkedToMessage: true })
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('未タスク化なら本文から作ったタイトルで作成し created: true を 201 で返す', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([messageRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([taskRow])

    const response = await callPost()

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ id: TASK_ID, created: true, title: '資料を確認する', channelType: 'project' })
    expect(mockInsertValues).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      channelId: CHANNEL_ID,
      title: '資料を確認する',
      priority: 'medium',
      status: 'todo',
      createdBy: USER_ID,
      sourceMessageId: MESSAGE_ID,
      assigneeId: null,
    })
  })

  it('本文が空のメッセージは 422 を返す', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ ...messageRow, content: '  ' }]).mockResolvedValueOnce([])

    const response = await callPost()

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: '本文のないメッセージはタスクにできません' })
    expect(mockInsertValues).not.toHaveBeenCalled()
  })
})
