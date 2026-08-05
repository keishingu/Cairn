// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { AuthContext } from '@/lib/get-auth-context'
import { getWorkspaceRole } from '@/lib/access/membership'
import { getGuestVisibleProjectIds } from '@/lib/permissions'
import { extractMentionIds, hydrateMentions } from '@/lib/chat/mentions'
import { DUE_SOON_DAYS, STALLED_DAYS } from '@/lib/ai-nudges/rules'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import { searchChunks } from './search-chunks'
import {
  AI_RESEARCH_LIMITS,
  clampResearchLimit,
  detectProjectDeadlineRisk,
  detectResearchTaskRisks,
  isResearchTruncated,
  messageEvidence,
  projectEvidence,
  sortResearchRisks,
  taskEvidence,
  type ResearchEvidence,
  type ResearchRisk,
} from './research'

export class ResearchAccessError extends Error {
  readonly code = 'ACCESS_DENIED'
}

interface ResearchScope {
  role: AuthContext['role']
  guestProjectIds: string[] | null
}

async function resolveScope(ctx: AuthContext): Promise<ResearchScope> {
  // Tool execution can happen several seconds after route authentication. Re-evaluate active
  // membership at the read boundary so deactivation/access loss is not hidden by a long stream.
  const role = await getWorkspaceRole(ctx.workspaceId, ctx.userId)
  if (!role) throw new ResearchAccessError('このワークスペースへの有効なアクセス権がありません')
  return {
    role,
    guestProjectIds:
      role === 'guest' ? await getGuestVisibleProjectIds(ctx.workspaceId, ctx.userId) : null,
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export interface ResearchProject {
  id: string
  title: string
  status: string | null
  startDate: string | null
  endDate: string | null
  archived: boolean
  updatedAt: string
  memberCount: number
  incompleteTaskCount: number
  overdueTaskCount: number
  totalTaskCount: number
  evidence: ResearchEvidence
}

export async function listResearchProjects(
  ctx: AuthContext,
  input: { limit?: number | undefined; includeArchived?: boolean | undefined } = {},
) {
  const scope = await resolveScope(ctx)
  const limit = clampResearchLimit(input.limit, AI_RESEARCH_LIMITS.projects)
  const includeArchived = input.includeArchived ?? false
  if (scope.guestProjectIds?.length === 0) {
    return {
      ok: true as const,
      items: [] satisfies ResearchProject[],
      returnedCount: 0,
      totalCount: 0,
      truncated: false,
      appliedFilters: { includeArchived, limit },
    }
  }

  const {
    activeWorkspaceMembers,
    db,
    projectMembers,
    projects,
    projectStatuses,
    tasks,
  } = await import('@cairn/db')
  const { and, count, eq, inArray, sql } = await import('drizzle-orm')
  const conditions = [eq(projects.workspaceId, ctx.workspaceId)]
  if (!includeArchived) conditions.push(eq(projects.archived, false))
  if (scope.guestProjectIds) conditions.push(inArray(projects.id, scope.guestProjectIds))

  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      status: projectStatuses.name,
      startDate: projects.startDate,
      endDate: projects.endDate,
      archived: projects.archived,
      updatedAt: projects.updatedAt,
      totalCount: sql<number>`count(*) over()`,
    })
    .from(projects)
    .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
    .where(and(...conditions))
    .orderBy(projects.archived, sql`${projects.updatedAt} desc`)
    .limit(limit + 1)

  const selected = rows.slice(0, limit)
  const projectIds = selected.map((row) => row.id)
  if (projectIds.length === 0) {
    return {
      ok: true as const,
      items: [] satisfies ResearchProject[],
      returnedCount: 0,
      totalCount: 0,
      truncated: false,
      appliedFilters: { includeArchived, limit },
    }
  }

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const [memberRows, taskRows] = await Promise.all([
    db
      .select({ projectId: projectMembers.projectId, memberCount: count() })
      .from(projectMembers)
      .innerJoin(
        activeWorkspaceMembers,
        and(
          eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId),
          eq(activeWorkspaceMembers.userId, projectMembers.userId),
        ),
      )
      .where(inArray(projectMembers.projectId, projectIds))
      .groupBy(projectMembers.projectId),
    db
      .select({
        projectId: tasks.projectId,
        totalTaskCount: count(),
        incompleteTaskCount: sql<number>`count(*) filter (where ${tasks.status} <> 'done')`,
        overdueTaskCount: sql<number>`count(*) filter (where ${tasks.status} <> 'done' and ${tasks.dueDate} < ${today})`,
      })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, ctx.workspaceId), inArray(tasks.projectId, projectIds)))
      .groupBy(tasks.projectId),
  ])
  const members = new Map(memberRows.map((row) => [row.projectId, Number(row.memberCount)]))
  const taskCounts = new Map(
    taskRows.map((row) => [
      row.projectId,
      {
        total: Number(row.totalTaskCount),
        incomplete: Number(row.incompleteTaskCount),
        overdue: Number(row.overdueTaskCount),
      },
    ]),
  )

  const items: ResearchProject[] = selected.map((row) => {
    const counts = taskCounts.get(row.id)
    const updatedAt = toIso(row.updatedAt)
    return {
      id: row.id,
      title: row.title,
      status: row.status ?? null,
      startDate: row.startDate,
      endDate: row.endDate,
      archived: row.archived,
      updatedAt,
      memberCount: members.get(row.id) ?? 0,
      incompleteTaskCount: counts?.incomplete ?? 0,
      overdueTaskCount: counts?.overdue ?? 0,
      totalTaskCount: counts?.total ?? 0,
      evidence: projectEvidence(row.id, row.title, updatedAt),
    }
  })
  const totalCount = Number(selected[0]?.totalCount ?? 0)

  return {
    ok: true as const,
    items,
    returnedCount: items.length,
    totalCount,
    truncated: isResearchTruncated(totalCount, items.length),
    appliedFilters: { includeArchived, limit },
  }
}

export type TaskResearchFilter = 'overdue' | 'due_soon' | 'stalled' | 'unassigned'

export interface ResearchTask {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  priority: 'high' | 'medium' | 'low'
  assignee: { id: string; name: string } | null
  dueDate: string | null
  updatedAt: string
  projectId: string
  evidence: ResearchEvidence
}

async function assertProjectAccess(ctx: AuthContext, scope: ResearchScope, projectId: string) {
  if (scope.guestProjectIds && !scope.guestProjectIds.includes(projectId)) {
    throw new ResearchAccessError('指定されたプロジェクトは見つからないか、アクセスできません')
  }
  const { db, projects } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [project] = await db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!project) {
    throw new ResearchAccessError('指定されたプロジェクトは見つからないか、アクセスできません')
  }
  return project
}

export async function listResearchProjectTasks(
  ctx: AuthContext,
  input: {
    projectId: string
    filters?: TaskResearchFilter[] | undefined
    limit?: number | undefined
  },
  now = new Date(),
) {
  const scope = await resolveScope(ctx)
  await assertProjectAccess(ctx, scope, input.projectId)
  const limit = clampResearchLimit(input.limit, AI_RESEARCH_LIMITS.tasks)
  const filters = [...new Set(input.filters ?? [])]
  const { db, profiles, tasks, workspaceMembers } = await import('@cairn/db')
  const { and, eq, gte, isNull, lt, lte, ne, or, sql } = await import('drizzle-orm')
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const dueSoon = new Date(`${today}T00:00:00Z`)
  dueSoon.setUTCDate(dueSoon.getUTCDate() + DUE_SOON_DAYS)
  const stalledBefore = new Date(now.getTime() - STALLED_DAYS * 86_400_000)
  const filterConditions = filters.map((filter) => {
    switch (filter) {
      case 'overdue':
        return and(ne(tasks.status, 'done'), lt(tasks.dueDate, today))
      case 'due_soon':
        return and(
          eq(tasks.status, 'todo'),
          gte(tasks.dueDate, today),
          lte(tasks.dueDate, dueSoon.toISOString().slice(0, 10)),
        )
      case 'stalled':
        return and(eq(tasks.status, 'in_progress'), lte(tasks.updatedAt, stalledBefore))
      case 'unassigned':
        return and(ne(tasks.status, 'done'), isNull(tasks.assigneeId))
    }
  })
  const conditions = [
    eq(tasks.workspaceId, ctx.workspaceId),
    eq(tasks.projectId, input.projectId),
    filters.length > 0 ? or(...filterConditions) : undefined,
  ]
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      assigneeId: tasks.assigneeId,
      assigneeName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
      dueDate: tasks.dueDate,
      updatedAt: tasks.updatedAt,
      totalCount: sql<number>`count(*) over()`,
    })
    .from(tasks)
    .leftJoin(profiles, eq(tasks.assigneeId, profiles.id))
    .leftJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.userId, tasks.assigneeId),
        eq(workspaceMembers.workspaceId, ctx.workspaceId),
      ),
    )
    .where(and(...conditions))
    .orderBy(sql`${tasks.dueDate} asc nulls last`, tasks.updatedAt)
    .limit(limit + 1)
  const selected = rows.slice(0, limit)
  const items: ResearchTask[] = selected.map((row) => {
    const updatedAt = toIso(row.updatedAt)
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      assignee:
        row.assigneeId && row.assigneeName
          ? { id: row.assigneeId, name: row.assigneeName }
          : null,
      dueDate: row.dueDate,
      updatedAt,
      projectId: input.projectId,
      evidence: taskEvidence({
        id: row.id,
        label: row.title,
        projectId: input.projectId,
        occurredAt: updatedAt,
      }),
    }
  })
  const totalCount = Number(selected[0]?.totalCount ?? 0)
  return {
    ok: true as const,
    items,
    returnedCount: items.length,
    totalCount,
    truncated: isResearchTruncated(totalCount, items.length),
    appliedFilters: { projectId: input.projectId, filters, limit, asOf: now.toISOString() },
  }
}

export async function getResearchRiskSnapshot(
  ctx: AuthContext,
  input: { includeArchived?: boolean | undefined } = {},
  now = new Date(),
) {
  const projectsResult = await listResearchProjects(ctx, {
    limit: AI_RESEARCH_LIMITS.projects,
    includeArchived: input.includeArchived,
  })
  const projects = projectsResult.items
  const projectIds = projects.map((project) => project.id)
  if (projectIds.length === 0) {
    return {
      ok: true as const,
      risks: [] satisfies ResearchRisk[],
      returnedCount: 0,
      truncated: projectsResult.truncated,
      coverage: {
        projectsChecked: 0,
        totalVisibleProjects: projectsResult.totalCount,
        totalTasksConsidered: 0,
        asOf: now.toISOString(),
      },
    }
  }

  const { db, tasks } = await import('@cairn/db')
  const { and, eq, gte, inArray, isNull, lt, lte, ne, or, sql } = await import('drizzle-orm')
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const dueSoon = new Date(`${today}T00:00:00Z`)
  dueSoon.setUTCDate(dueSoon.getUTCDate() + DUE_SOON_DAYS)
  const stalledBefore = new Date(now.getTime() - STALLED_DAYS * 86_400_000)
  const taskRows = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      assigneeId: tasks.assigneeId,
      dueDate: tasks.dueDate,
      updatedAt: tasks.updatedAt,
      totalCount: sql<number>`count(*) over()`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, ctx.workspaceId),
        inArray(tasks.projectId, projectIds),
        ne(tasks.status, 'done'),
        or(
          lt(tasks.dueDate, today),
          and(
            eq(tasks.status, 'todo'),
            gte(tasks.dueDate, today),
            lte(tasks.dueDate, dueSoon.toISOString().slice(0, 10)),
          ),
          and(eq(tasks.status, 'in_progress'), lte(tasks.updatedAt, stalledBefore)),
          isNull(tasks.assigneeId),
        ),
      ),
    )
    .orderBy(sql`${tasks.dueDate} asc nulls last`, tasks.updatedAt)
    .limit(AI_RESEARCH_LIMITS.risks + 1)

  const taskRisks = taskRows
    .slice(0, AI_RESEARCH_LIMITS.risks)
    .flatMap((task) =>
      task.projectId
        ? detectResearchTaskRisks(
            {
              id: task.id,
              projectId: task.projectId,
              title: task.title,
              status: task.status,
              priority: task.priority,
              assigneeId: task.assigneeId,
              dueDate: task.dueDate,
              updatedAt: task.updatedAt,
            },
            now,
          )
        : [],
    )
  const projectRisks = projects.flatMap((project) => {
    const risk = detectProjectDeadlineRisk({
      id: project.id,
      title: project.title,
      endDate: project.endDate,
      incompleteTaskCount: project.incompleteTaskCount,
      totalTaskCount: project.totalTaskCount,
      archived: project.archived,
      updatedAt: new Date(project.updatedAt),
      now,
    })
    return risk ? [risk] : []
  })
  const allRisks = sortResearchRisks([...taskRisks, ...projectRisks])
  const risks = allRisks.slice(0, AI_RESEARCH_LIMITS.risks)
  const candidateTaskTotal = Number(taskRows[0]?.totalCount ?? 0)
  const totalTasksConsidered = projects.reduce((sum, project) => sum + project.totalTaskCount, 0)

  return {
    ok: true as const,
    risks,
    returnedCount: risks.length,
    truncated:
      projectsResult.truncated ||
      candidateTaskTotal > AI_RESEARCH_LIMITS.risks ||
      allRisks.length > risks.length,
    coverage: {
      projectsChecked: projects.length,
      totalVisibleProjects: projectsResult.totalCount,
      totalTasksConsidered,
      candidateTasksEvaluated: Math.min(taskRows.length, AI_RESEARCH_LIMITS.risks),
      asOf: now.toISOString(),
      includeArchived: input.includeArchived ?? false,
    },
  }
}

interface ResearchChannelRow {
  id: string
  name: string
  type: string
  isPrivate: boolean
  projectId: string | null
}

export function canAccessResearchChannel(
  channel: Pick<ResearchChannelRow, 'id' | 'type' | 'isPrivate' | 'projectId'>,
  scope: { role: AuthContext['role']; guestProjectIds: string[] | null },
  joinedChannelIds: Set<string>,
): boolean {
  if (channel.type === 'dm') return false
  if (scope.role === 'guest') {
    if (channel.type === 'project') {
      return (
        !!channel.projectId &&
        !!scope.guestProjectIds?.includes(channel.projectId) &&
        (!channel.isPrivate || joinedChannelIds.has(channel.id))
      )
    }
    // Normal workspace channel lists show guests only channels they explicitly joined.
    return joinedChannelIds.has(channel.id)
  }
  return !channel.isPrivate || joinedChannelIds.has(channel.id)
}

export interface ResearchMessage {
  id: string
  channelId: string
  channelName: string
  projectId: string | null
  sender: { id: string; name: string }
  createdAt: string
  content: string
  contentTruncated: boolean
  replyToId: string | null
  hasDirectReply: boolean
  evidence: ResearchEvidence
}

export async function searchResearchChannelMessages(
  ctx: AuthContext,
  input: {
    query?: string | undefined
    projectId?: string | undefined
    channelId?: string | undefined
    lookbackDays?: number | undefined
    limit?: number | undefined
  },
  now = new Date(),
) {
  const scope = await resolveScope(ctx)
  const limit = clampResearchLimit(input.limit, AI_RESEARCH_LIMITS.messages)
  const lookbackDays = clampResearchLimit(
    input.lookbackDays ?? AI_RESEARCH_LIMITS.messageLookbackDefaultDays,
    AI_RESEARCH_LIMITS.messageLookbackMaxDays,
  )
  if (input.projectId) await assertProjectAccess(ctx, scope, input.projectId)

  const {
    channelMembers,
    channels,
    db,
    messages,
    milestones,
    profiles,
    projects,
    workspaceMembers,
  } = await import('@cairn/db')
  const { and, desc, eq, gt, ilike, inArray, isNull, ne, sql } = await import('drizzle-orm')
  const channelConditions = [
    sql`coalesce(${channels.workspaceId}, ${projects.workspaceId}) = ${ctx.workspaceId}::uuid`,
    ne(channels.type, 'dm'),
    input.projectId ? eq(channels.projectId, input.projectId) : undefined,
    input.channelId ? eq(channels.id, input.channelId) : undefined,
  ]
  const channelRows = await db
    .select({
      id: channels.id,
      name: sql<string>`coalesce(${milestones.title}, ${projects.title}, ${channels.name}, '名称なし')`,
      type: channels.type,
      isPrivate: channels.isPrivate,
      projectId: channels.projectId,
    })
    .from(channels)
    .leftJoin(projects, eq(channels.projectId, projects.id))
    .leftJoin(milestones, eq(channels.milestoneId, milestones.id))
    .where(and(...channelConditions))

  const joinedRows =
    channelRows.length > 0
      ? await db
          .select({ channelId: channelMembers.channelId })
          .from(channelMembers)
          .where(
            and(
              eq(channelMembers.userId, ctx.userId),
              inArray(
                channelMembers.channelId,
                channelRows.map((channel) => channel.id),
              ),
            ),
          )
      : []
  const joinedChannelIds = new Set(joinedRows.map((row) => row.channelId))
  const accessibleChannels = channelRows.filter((channel) =>
    canAccessResearchChannel(channel, scope, joinedChannelIds),
  )
  if (input.channelId && accessibleChannels.length === 0) {
    throw new ResearchAccessError('指定されたチャンネルは見つからないか、アクセスできません')
  }
  if (accessibleChannels.length === 0) {
    return {
      ok: true as const,
      items: [] satisfies ResearchMessage[],
      returnedCount: 0,
      totalCount: 0,
      truncated: false,
      appliedFilters: {
        query: input.query?.trim() || null,
        projectId: input.projectId ?? null,
        channelId: input.channelId ?? null,
        lookbackDays,
        limit,
        dmExcluded: true,
      },
    }
  }
  const channelMap = new Map(accessibleChannels.map((channel) => [channel.id, channel]))
  const since = new Date(now.getTime() - lookbackDays * 86_400_000)
  const query = input.query?.trim() ?? ''
  const rows = await db
    .select({
      id: messages.id,
      channelId: messages.channelId,
      senderId: messages.senderId,
      senderName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
      createdAt: messages.createdAt,
      content: messages.content,
      replyToId: messages.parentMessageId,
      totalCount: sql<number>`count(*) over()`,
    })
    .from(messages)
    .innerJoin(profiles, eq(messages.senderId, profiles.id))
    .leftJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.userId, messages.senderId),
        eq(workspaceMembers.workspaceId, ctx.workspaceId),
      ),
    )
    .where(
      and(
        inArray(
          messages.channelId,
          accessibleChannels.map((channel) => channel.id),
        ),
        isNull(messages.deletedAt),
        ne(messages.messageType, 'system'),
        gt(messages.createdAt, since),
        query ? ilike(messages.content, `%${query}%`) : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1)
  const selected = rows.slice(0, limit)
  const selectedIds = selected.map((row) => row.id)
  const directReplyRows =
    selectedIds.length > 0
      ? await db
          .select({ parentMessageId: messages.parentMessageId })
          .from(messages)
          .where(
            and(
              inArray(messages.parentMessageId, selectedIds),
              inArray(
                messages.channelId,
                accessibleChannels.map((channel) => channel.id),
              ),
              isNull(messages.deletedAt),
            ),
          )
      : []
  const repliedIds = new Set(
    directReplyRows
      .map((row) => row.parentMessageId)
      .filter((id): id is string => typeof id === 'string'),
  )
  const mentionIds = [...new Set(selected.flatMap((row) => extractMentionIds(row.content)))]
  const mentionNameMap = new Map<string, string>()
  if (mentionIds.length > 0) {
    const names = await db
      .select({
        id: profiles.id,
        name: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
      })
      .from(profiles)
      .leftJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.userId, profiles.id),
          eq(workspaceMembers.workspaceId, ctx.workspaceId),
        ),
      )
      .where(inArray(profiles.id, mentionIds))
    for (const name of names) mentionNameMap.set(name.id, name.name)
  }

  // The SQL query is newest-first so it can cap efficiently; tools receive chronological data.
  const items: ResearchMessage[] = selected.reverse().map((row) => {
    const channel = channelMap.get(row.channelId)!
    const createdAt = toIso(row.createdAt)
    const hydrated = hydrateMentions(row.content, (id) => mentionNameMap.get(id))
    const contentTruncated = hydrated.length > AI_RESEARCH_LIMITS.messageContentChars
    return {
      id: row.id,
      channelId: row.channelId,
      channelName: channel.name,
      projectId: channel.projectId,
      sender: { id: row.senderId, name: row.senderName },
      createdAt,
      content: hydrated.slice(0, AI_RESEARCH_LIMITS.messageContentChars),
      contentTruncated,
      replyToId: row.replyToId,
      hasDirectReply: repliedIds.has(row.id),
      evidence: messageEvidence({
        id: row.id,
        label: `${channel.name} / ${row.senderName}`,
        channelId: row.channelId,
        projectId: channel.projectId,
        occurredAt: createdAt,
      }),
    }
  })
  const totalCount = Number(selected[0]?.totalCount ?? 0)
  return {
    ok: true as const,
    items,
    returnedCount: items.length,
    totalCount,
    truncated: isResearchTruncated(
      totalCount,
      items.length,
      items.some((item) => item.contentTruncated),
    ),
    appliedFilters: {
      query: query || null,
      projectId: input.projectId ?? null,
      channelId: input.channelId ?? null,
      lookbackDays,
      since: since.toISOString(),
      until: now.toISOString(),
      limit,
      dmExcluded: true,
    },
  }
}

export interface ResearchDocument {
  source: { type: string; id: string; name: string }
  similarity: number
  content: string
  contentTruncated: boolean
  evidence: ResearchEvidence
}

export async function searchResearchDocuments(
  ctx: AuthContext,
  input: { query: string; limit?: number | undefined },
) {
  const scope = await resolveScope(ctx)
  const limit = clampResearchLimit(input.limit, AI_RESEARCH_LIMITS.documents)
  const chunks = await searchChunks(input.query, ctx.workspaceId, {
    limit: limit + 1,
    minSimilarity: 0.5,
    allowedProjectIds: scope.guestProjectIds,
    userId: ctx.userId,
    role: scope.role,
  })
  const selected = chunks.slice(0, limit)
  const { db, files, profiles, projects } = await import('@cairn/db')
  const { and, eq, inArray } = await import('drizzle-orm')
  const fileIds = selected.filter((chunk) => chunk.sourceType === 'file').map((chunk) => chunk.sourceId)
  const projectIds = selected
    .filter((chunk) => chunk.sourceType === 'project')
    .map((chunk) => chunk.sourceId)
  const memberIds = selected
    .filter((chunk) => chunk.sourceType === 'member')
    .map((chunk) => chunk.sourceId)
  const [fileRows, projectRows, memberRows] = await Promise.all([
    fileIds.length > 0
      ? db
          .select({
            id: files.id,
            name: files.fileName,
            type: files.fileType,
            metadata: files.metadata,
          })
          .from(files)
          .where(and(eq(files.workspaceId, ctx.workspaceId), inArray(files.id, fileIds)))
      : [],
    projectIds.length > 0
      ? db
          .select({ id: projects.id, name: projects.title })
          .from(projects)
          .where(and(eq(projects.workspaceId, ctx.workspaceId), inArray(projects.id, projectIds)))
      : [],
    memberIds.length > 0
      ? db
          .select({ id: profiles.id, name: profiles.displayName })
          .from(profiles)
          .where(inArray(profiles.id, memberIds))
      : [],
  ])
  const fileMap = new Map(fileRows.map((row) => [row.id, row]))
  const projectMap = new Map(projectRows.map((row) => [row.id, row.name]))
  const memberMap = new Map(memberRows.map((row) => [row.id, row.name]))

  const items: ResearchDocument[] = selected.flatMap((chunk) => {
    let name: string | undefined
    let href: string | undefined
    if (chunk.sourceType === 'file') {
      const file = fileMap.get(chunk.sourceId)
      if (!file) return []
      const metadata = (file.metadata ?? {}) as Record<string, unknown>
      const externalUrl = safeExternalUrl(metadata['externalUrl'])
      name = file.name
      href =
        file.type === 'link' && externalUrl
          ? externalUrl
          : `/api/attachments/${encodeURIComponent(file.id)}`
    } else if (chunk.sourceType === 'project') {
      name = projectMap.get(chunk.sourceId)
      href = `/projects?open=project-${encodeURIComponent(chunk.sourceId)}`
    } else if (chunk.sourceType === 'member') {
      name = memberMap.get(chunk.sourceId)
      href = `/members/${encodeURIComponent(chunk.sourceId)}`
    }
    if (!name || !href) return []
    const type = chunk.sourceType as ResearchEvidence['type']
    const contentTruncated = chunk.content.length > AI_RESEARCH_LIMITS.documentContentChars
    return [
      {
        source: { type: chunk.sourceType, id: chunk.sourceId, name },
        similarity: chunk.similarity,
        content: chunk.content.slice(0, AI_RESEARCH_LIMITS.documentContentChars),
        contentTruncated,
        evidence: { type, id: chunk.sourceId, label: name, href },
      },
    ]
  })
  return {
    ok: true as const,
    items,
    returnedCount: items.length,
    truncated: chunks.length > limit || items.some((item) => item.contentTruncated),
    appliedFilters: { query: input.query, limit, minSimilarity: 0.5 },
  }
}
