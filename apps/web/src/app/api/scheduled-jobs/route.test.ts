// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const ACCESSIBLE_CHANNEL_ID = '20000000-0000-0000-0000-000000000001'
const HIDDEN_CHANNEL_ID = '20000000-0000-0000-0000-000000000002'
const VISIBLE_JOB_ID = '30000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireWorkspaceMember,
  mockRequireChannelAccess,
  mockCompileScheduledJobInstruction,
  mockInsertValues,
  mockUpdateSet,
  mockUpdateWhere,
  mockLimit,
  mockOrderBy,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireWorkspaceMember: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockCompileScheduledJobInstruction: vi.fn(),
  mockInsertValues: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockOrderBy: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireWorkspaceMember: mockRequireWorkspaceMember,
  requireChannelAccess: mockRequireChannelAccess,
}))
vi.mock('@/lib/scheduled-jobs/compile', () => ({
  compileScheduledJobInstruction: mockCompileScheduledJobInstruction,
  ScheduledJobCompileError: class ScheduledJobCompileError extends Error {},
}))
vi.mock('@/lib/workspace-member-display-name', () => ({
  workspaceMemberDisplayName: () => 'display_name',
}))
vi.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => args,
  desc: (...args: unknown[]) => args,
  and: (...args: unknown[]) => args,
  sql: (...args: unknown[]) => args,
}))
vi.mock('@cairn/db', () => {
  const scheduledJobs = {
    id: 'scheduled_jobs.id',
    workspaceId: 'scheduled_jobs.workspace_id',
    channelId: 'scheduled_jobs.channel_id',
    createdBy: 'scheduled_jobs.created_by',
    updatedBy: 'scheduled_jobs.updated_by',
    enabled: 'scheduled_jobs.enabled',
    rawInstruction: 'scheduled_jobs.raw_instruction',
    timezone: 'scheduled_jobs.timezone',
    schedule: 'scheduled_jobs.schedule',
    mentionUserIds: 'scheduled_jobs.mention_user_ids',
    mentions: 'scheduled_jobs.mentions',
    actionSpec: 'scheduled_jobs.action_spec',
    nextRunAt: 'scheduled_jobs.next_run_at',
    lastCompiledAt: 'scheduled_jobs.last_compiled_at',
    lastCompilePreview: 'scheduled_jobs.last_compile_preview',
    updatedAt: 'scheduled_jobs.updated_at',
    createdAt: 'scheduled_jobs.created_at',
  }
  const channels = { id: 'channels.id', name: 'channels.name', workspaceId: 'channels.workspace_id', projectId: 'channels.project_id' }
  const profiles = { displayName: 'profiles.display_name', id: 'profiles.id' }
  const projects = { id: 'projects.id', workspaceId: 'projects.workspace_id' }
  const workspaceMembers = {
    userId: 'workspace_members.user_id',
    displayName: 'workspace_members.display_name',
    workspaceId: 'workspace_members.workspace_id',
    membershipStatus: 'workspace_members.membership_status',
  }

  const db = {
    insert: vi.fn(() => ({
      values: mockInsertValues,
    })),
    update: vi.fn(() => ({
      set: mockUpdateSet,
    })),
    select: vi.fn(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: mockOrderBy,
          }),
        }),
        leftJoin: () => ({
          where: async () => [],
        }),
        where: () => ({
          limit: mockLimit,
        }),
      }),
    })),
  }

  return { db, scheduledJobs, channels, profiles, projects, workspaceMembers }
})

function postRequest() {
  return new Request('http://localhost/api/scheduled-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawInstruction: '毎月15日 9:00 に #登山本部 で @山田 をメンションして投票を投稿',
      enabled: true,
    }),
  })
}

function putRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/scheduled-jobs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/scheduled-jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockRequireWorkspaceMember.mockResolvedValue(null)
    mockCompileScheduledJobInstruction.mockResolvedValue({
      channelId: ACCESSIBLE_CHANNEL_ID,
      schedule: { type: 'monthly', dayOfMonth: 15, hour: 9, minute: 0 },
      mentionUserIds: [DEV_USER_ID],
      mentions: [{ userId: DEV_USER_ID, displayName: '山田' }],
      actionSpec: { type: 'poll', prompt: '来月の各週', choicesPrompt: '来月の各週', allowMultiple: false, anonymous: false },
      nextRunAt: new Date('2026-07-15T00:00:00.000Z'),
      preview: 'preview',
    })
    mockInsertValues.mockResolvedValue(undefined)
    mockUpdateWhere.mockResolvedValue(undefined)
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
    mockLimit.mockResolvedValue([])
    mockOrderBy.mockResolvedValue([
      {
        id: VISIBLE_JOB_ID,
        rawInstruction: 'visible',
        enabled: true,
        timezone: 'Asia/Tokyo',
        schedule: { type: 'monthly', dayOfMonth: 15, hour: 9, minute: 0 },
        actionSpec: { type: 'poll', prompt: 'visible', choicesPrompt: 'visible', allowMultiple: false, anonymous: false },
        mentionUserIds: [DEV_USER_ID],
        mentions: [{ userId: DEV_USER_ID, displayName: '山田' }],
        channelId: ACCESSIBLE_CHANNEL_ID,
        channelName: '登山本部',
        nextRunAt: new Date('2026-07-15T00:00:00.000Z'),
        lastCompilePreview: 'visible preview',
        createdAt: new Date('2026-07-09T05:00:00.000Z'),
        updatedAt: new Date('2026-07-09T05:00:00.000Z'),
      },
      {
        id: 'job-hidden',
        rawInstruction: 'hidden',
        enabled: true,
        timezone: 'Asia/Tokyo',
        schedule: { type: 'monthly', dayOfMonth: 16, hour: 9, minute: 0 },
        actionSpec: { type: 'poll', prompt: 'hidden', choicesPrompt: 'hidden', allowMultiple: false, anonymous: false },
        mentionUserIds: [],
        mentions: [],
        channelId: HIDDEN_CHANNEL_ID,
        channelName: '役員部屋',
        nextRunAt: new Date('2026-07-16T00:00:00.000Z'),
        lastCompilePreview: 'hidden preview',
        createdAt: new Date('2026-07-09T05:00:00.000Z'),
        updatedAt: new Date('2026-07-09T05:00:00.000Z'),
      },
    ])
    mockRequireChannelAccess.mockImplementation(async (_workspaceId: string, _userId: string, channelId: string) => (
      channelId === HIDDEN_CHANNEL_ID
        ? new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })
        : null
    ))
  })

  it('作成レスポンスからアクセス不能なチャンネルのジョブを除外する', async () => {
    const { POST } = await import('./route')

    const res = await POST(postRequest())
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({
      id: VISIBLE_JOB_ID,
      channelId: ACCESSIBLE_CHANNEL_ID,
      channelName: '登山本部',
    })
  })

  it('無効化中に過去日付になったジョブを再有効化すると nextRunAt を未来へ進める', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-20T00:00:00.000Z'))
    mockLimit.mockResolvedValue([
      {
        id: VISIBLE_JOB_ID,
        workspaceId: DEV_WORKSPACE_ID,
        channelId: ACCESSIBLE_CHANNEL_ID,
        enabled: false,
        schedule: { type: 'monthly', dayOfMonth: 15, hour: 9, minute: 0 },
        nextRunAt: new Date('2026-07-15T00:00:00.000Z'),
      },
    ])

    const { PUT } = await import('./route')

    const res = await PUT(putRequest({ id: VISIBLE_JOB_ID, enabled: true }))

    expect(res.status).toBe(200)
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      nextRunAt: new Date('2026-08-15T00:00:00.000Z'),
      updatedBy: DEV_USER_ID,
    }))
    vi.useRealTimers()
  })
})
