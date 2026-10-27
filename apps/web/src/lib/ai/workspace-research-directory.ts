// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// AIオートメーション Phase 0 の読み取り（docs/ai-automation-design.md §5.1）。
// `/ai` の tool と MCP（`/api/research/*` 経由）で同じ実装を使う。境界は既存画面の API と揃える。

import type { AuthContext } from '@/lib/get-auth-context'
import { hydrateMentions } from '@/lib/chat/mentions'
import { buildMentionNameMap } from '@/lib/chat/mention-name-map'
import { readFileContent } from '@/lib/files/read-file-content'
import { isWorkspaceAdmin } from '@/lib/permissions'
import { getProfileAttributesByUserIds } from '@/lib/profile-attributes'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import {
  AI_RESEARCH_LIMITS,
  channelEvidence,
  clampResearchLimit,
  fileEvidence,
  isResearchTruncated,
  memberEvidence,
  messageEvidence,
  projectEvidence,
  type ResearchEvidence,
} from './research'
import {
  ResearchAccessError,
  assertProjectAccess,
  canAccessResearchChannel,
  resolveScope,
  safeExternalUrl,
  toIso,
  type ResearchScope,
} from './workspace-research'

type ProjectMemberRole = 'leader' | 'subleader' | 'member' | 'reviewer' | 'observer'

// プロジェクトの役割マスター（project_roles）が無い旧データの表示名。`/api/projects/[id]/members` と同じ
const LEGACY_PROJECT_ROLE_NAMES: Record<ProjectMemberRole, string> = {
  leader: 'リーダー',
  subleader: 'サブリーダー',
  member: 'メンバー',
  reviewer: 'レビュアー',
  observer: 'オブザーバー',
}

async function loadAccessibleChannels(
  ctx: AuthContext,
  scope: ResearchScope,
  filter: { channelId?: string | undefined; projectId?: string | undefined },
) {
  const { channelMembers, channels, db, milestones, projects } = await import('@cairn/db')
  const { and, eq, inArray, ne, sql } = await import('drizzle-orm')
  const rows = await db
    .select({
      id: channels.id,
      // スレッドは自分の名前、プロジェクト・マイルストーンのチャンネルは画面と同じくその名前で呼ぶ
      name: sql<string>`case when ${channels.parentChannelId} is not null then coalesce(${channels.name}, '名称なし')
        else coalesce(${milestones.title}, ${projects.title}, ${channels.name}, '名称なし') end`,
      type: channels.type,
      isPrivate: channels.isPrivate,
      projectId: channels.projectId,
      projectTitle: projects.title,
      milestoneId: channels.milestoneId,
      parentChannelId: channels.parentChannelId,
      archivedAt: channels.archivedAt,
      createdAt: channels.createdAt,
    })
    .from(channels)
    .leftJoin(projects, eq(channels.projectId, projects.id))
    .leftJoin(milestones, eq(channels.milestoneId, milestones.id))
    .where(
      and(
        sql`coalesce(${channels.workspaceId}, ${projects.workspaceId}) = ${ctx.workspaceId}::uuid`,
        ne(channels.type, 'dm'),
        filter.channelId ? eq(channels.id, filter.channelId) : undefined,
        filter.projectId ? eq(channels.projectId, filter.projectId) : undefined,
      ),
    )
    .orderBy(channels.createdAt)
  const joined =
    rows.length > 0
      ? await db
          .select({ channelId: channelMembers.channelId })
          .from(channelMembers)
          .where(
            and(
              eq(channelMembers.userId, ctx.userId),
              inArray(channelMembers.channelId, rows.map((row) => row.id)),
            ),
          )
      : []
  const joinedIds = new Set(joined.map((row) => row.channelId))
  return rows.filter((row) => canAccessResearchChannel(row, scope, joinedIds))
}

export interface ResearchChannel {
  id: string
  name: string
  type: 'workspace' | 'project'
  isPrivate: boolean
  projectId: string | null
  projectTitle: string | null
  milestoneId: string | null
  parentChannelId: string | null
  archived: boolean
  evidence: ResearchEvidence
}

export async function listResearchChannels(
  ctx: AuthContext,
  input: {
    query?: string | undefined
    projectId?: string | undefined
    includeArchived?: boolean | undefined
    limit?: number | undefined
  } = {},
) {
  const scope = await resolveScope(ctx)
  if (input.projectId) await assertProjectAccess(ctx, scope, input.projectId)
  const limit = clampResearchLimit(input.limit, AI_RESEARCH_LIMITS.channels)
  const includeArchived = input.includeArchived ?? false
  const query = input.query?.trim().replace(/^#/, '').toLowerCase() ?? ''

  const accessible = await loadAccessibleChannels(ctx, scope, { projectId: input.projectId })
  const matched = accessible.filter(
    (row) =>
      (includeArchived || !row.archivedAt) &&
      (!query ||
        row.name.toLowerCase().includes(query) ||
        (row.projectTitle?.toLowerCase().includes(query) ?? false)),
  )
  const items: ResearchChannel[] = matched.slice(0, limit).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type as ResearchChannel['type'],
    isPrivate: row.isPrivate,
    projectId: row.projectId,
    projectTitle: row.projectTitle ?? null,
    milestoneId: row.milestoneId,
    parentChannelId: row.parentChannelId,
    archived: !!row.archivedAt,
    evidence: channelEvidence({ id: row.id, label: `#${row.name}`, projectId: row.projectId }),
  }))
  return {
    ok: true as const,
    items,
    returnedCount: items.length,
    totalCount: matched.length,
    truncated: isResearchTruncated(matched.length, items.length),
    appliedFilters: {
      query: query || null,
      projectId: input.projectId ?? null,
      includeArchived,
      limit,
      dmExcluded: true,
    },
  }
}

export interface ResearchChannelMessage {
  id: string
  channelId: string
  sender: { id: string; name: string }
  createdAt: string
  content: string
  contentTruncated: boolean
  replyToId: string | null
  evidence: ResearchEvidence
}

// 時系列（古い順）の続きを読むためのカーソル。同時刻の投稿を取りこぼさないよう ID も含める
export function encodeMessageCursor(createdAt: string, id: string): string {
  return `${createdAt}_${id}`
}

export function decodeMessageCursor(cursor: string): { createdAt: Date; id: string } | null {
  const separator = cursor.lastIndexOf('_')
  if (separator <= 0) return null
  const createdAt = new Date(cursor.slice(0, separator))
  const id = cursor.slice(separator + 1)
  if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) return null
  return { createdAt, id }
}

export async function readResearchChannelMessages(
  ctx: AuthContext,
  input: {
    channelId: string
    since?: string | undefined
    until?: string | undefined
    cursor?: string | undefined
    limit?: number | undefined
  },
  now = new Date(),
) {
  const scope = await resolveScope(ctx)
  const [channel] = await loadAccessibleChannels(ctx, scope, { channelId: input.channelId })
  if (!channel) {
    throw new ResearchAccessError('指定されたチャンネルは見つからないか、アクセスできません')
  }
  const limit = clampResearchLimit(input.limit, AI_RESEARCH_LIMITS.messages)
  const until = input.until ? new Date(input.until) : now
  const since = input.since
    ? new Date(input.since)
    : new Date(until.getTime() - AI_RESEARCH_LIMITS.messageLookbackDefaultDays * 86_400_000)
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
    throw new ResearchAccessError('since / until の日時が不正です')
  }
  const cursor = input.cursor ? decodeMessageCursor(input.cursor) : null
  if (input.cursor && !cursor) throw new ResearchAccessError('cursor が不正です')

  const { db, messages, profiles, workspaceMembers } = await import('@cairn/db')
  const { and, asc, eq, gt, isNull, lte, ne, or, sql } = await import('drizzle-orm')
  const rows = await db
    .select({
      id: messages.id,
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
        eq(messages.channelId, channel.id),
        isNull(messages.deletedAt),
        ne(messages.messageType, 'system'),
        cursor
          ? or(
              gt(messages.createdAt, cursor.createdAt),
              and(eq(messages.createdAt, cursor.createdAt), gt(messages.id, cursor.id)),
            )
          : gt(messages.createdAt, since),
        lte(messages.createdAt, until),
      ),
    )
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .limit(limit + 1)
  const selected = rows.slice(0, limit)
  const mentionNameMap = await buildMentionNameMap(
    ctx.workspaceId,
    selected.map((row) => row.content),
  )
  const items: ResearchChannelMessage[] = selected.map((row) => {
    const createdAt = toIso(row.createdAt)
    const hydrated = hydrateMentions(row.content, (id) => mentionNameMap.get(id))
    return {
      id: row.id,
      channelId: channel.id,
      sender: { id: row.senderId, name: row.senderName },
      createdAt,
      content: hydrated.slice(0, AI_RESEARCH_LIMITS.messageContentChars),
      contentTruncated: hydrated.length > AI_RESEARCH_LIMITS.messageContentChars,
      replyToId: row.replyToId,
      evidence: messageEvidence({
        id: row.id,
        label: `#${channel.name} / ${row.senderName}`,
        channelId: channel.id,
        projectId: channel.projectId,
        occurredAt: createdAt,
      }),
    }
  })
  const hasMore = rows.length > limit
  const last = items.at(-1)
  return {
    ok: true as const,
    channel: {
      id: channel.id,
      name: channel.name,
      projectId: channel.projectId,
      parentChannelId: channel.parentChannelId,
      evidence: channelEvidence({ id: channel.id, label: `#${channel.name}`, projectId: channel.projectId }),
    },
    items,
    returnedCount: items.length,
    totalCount: Number(selected[0]?.totalCount ?? 0),
    truncated: hasMore || items.some((item) => item.contentTruncated),
    nextCursor: hasMore && last ? encodeMessageCursor(last.createdAt, last.id) : null,
    appliedFilters: {
      channelId: channel.id,
      since: cursor ? null : since.toISOString(),
      until: until.toISOString(),
      cursor: input.cursor ?? null,
      limit,
      order: 'oldest_first' as const,
    },
  }
}

export interface ResearchProfileAttribute {
  id: string
  name: string
}

export interface ResearchProjectMember {
  userId: string
  name: string
  role: ProjectMemberRole
  roleName: string
  attendance: 'attending' | 'tentative' | 'declined'
  addedAt: string
  profileAttributes: ResearchProfileAttribute[]
  evidence: ResearchEvidence[]
}

export async function getResearchProjectMembers(
  ctx: AuthContext,
  input: { projectId: string },
) {
  const scope = await resolveScope(ctx)
  const project = await assertProjectAccess(ctx, scope, input.projectId)
  const {
    activeWorkspaceMembers,
    db,
    profiles,
    projectMembers,
    projectRoles,
    workspaceMembers,
  } = await import('@cairn/db')
  const { and, asc, eq } = await import('drizzle-orm')
  const rows = await db
    .select({
      userId: profiles.id,
      name: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
      role: projectMembers.role,
      roleName: projectRoles.name,
      attendance: projectMembers.attendance,
      addedAt: projectMembers.createdAt,
    })
    .from(projectMembers)
    .innerJoin(
      activeWorkspaceMembers,
      and(
        eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId),
        eq(activeWorkspaceMembers.userId, projectMembers.userId),
      ),
    )
    .innerJoin(profiles, eq(projectMembers.userId, profiles.id))
    .leftJoin(
      workspaceMembers,
      and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
    )
    .leftJoin(
      projectRoles,
      and(eq(projectMembers.roleId, projectRoles.id), eq(projectRoles.workspaceId, ctx.workspaceId)),
    )
    .where(eq(projectMembers.projectId, input.projectId))
    .orderBy(
      asc(projectRoles.sortOrder),
      workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
    )
  const attributes = await getProfileAttributesByUserIds(
    ctx.workspaceId,
    rows.map((row) => row.userId),
  )
  const items: ResearchProjectMember[] = rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    role: row.role,
    roleName: row.roleName ?? LEGACY_PROJECT_ROLE_NAMES[row.role],
    attendance: row.attendance,
    addedAt: toIso(row.addedAt),
    profileAttributes: (attributes.get(row.userId) ?? []).map(({ id, name }) => ({ id, name })),
    evidence: [memberEvidence(row.userId, row.name)],
  }))
  return {
    ok: true as const,
    project: { id: project.id, title: project.title, evidence: projectEvidence(project.id, project.title) },
    items,
    returnedCount: items.length,
    totalCount: items.length,
    truncated: false,
  }
}

// ゲストに見えるメンバーは、参加プロジェクトの共同メンバーと自分だけ（`/api/workspaces/members` と同じ）
async function guestVisibleUserIds(ctx: AuthContext, scope: ResearchScope): Promise<string[] | null> {
  if (!scope.guestProjectIds) return null
  if (scope.guestProjectIds.length === 0) return [ctx.userId]
  const { db, projectMembers } = await import('@cairn/db')
  const { inArray } = await import('drizzle-orm')
  const rows = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(inArray(projectMembers.projectId, scope.guestProjectIds))
  return [...new Set([ctx.userId, ...rows.map((row) => row.userId)])]
}

export interface ResearchMember {
  userId: string
  name: string
  workspaceRole: 'owner' | 'admin' | 'member' | 'guest'
  membershipStatus: 'active' | 'inactive'
  profileAttributes: ResearchProfileAttribute[]
  joinedAt: string
  evidence: ResearchEvidence[]
}

export async function listResearchMembers(
  ctx: AuthContext,
  input: {
    query?: string | undefined
    attributeNames?: string[] | undefined
    includeInactive?: boolean | undefined
    limit?: number | undefined
  } = {},
) {
  const scope = await resolveScope(ctx)
  const limit = clampResearchLimit(input.limit, AI_RESEARCH_LIMITS.members)
  // 非活性メンバーはメンバー一覧でも管理者だけが見られる
  const includeInactive = (input.includeInactive ?? false) && isWorkspaceAdmin(scope.role)
  const query = input.query?.trim().toLowerCase() ?? ''
  const attributeNames = [
    ...new Set((input.attributeNames ?? []).map((name) => name.trim()).filter(Boolean)),
  ]
  const visibleUserIds = await guestVisibleUserIds(ctx, scope)

  const { db, profiles, workspaceMembers } = await import('@cairn/db')
  const { and, eq, inArray } = await import('drizzle-orm')
  const rows = await db
    .select({
      userId: profiles.id,
      name: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
      workspaceRole: workspaceMembers.role,
      membershipStatus: workspaceMembers.membershipStatus,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .innerJoin(profiles, eq(workspaceMembers.userId, profiles.id))
    .where(
      and(
        eq(workspaceMembers.workspaceId, ctx.workspaceId),
        visibleUserIds ? inArray(workspaceMembers.userId, visibleUserIds) : undefined,
        includeInactive ? undefined : eq(workspaceMembers.membershipStatus, 'active'),
      ),
    )
    .orderBy(workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName))
  const attributes = await getProfileAttributesByUserIds(
    ctx.workspaceId,
    rows.map((row) => row.userId),
  )
  const matched = rows.flatMap((row) => {
    const memberAttributes = (attributes.get(row.userId) ?? []).map(({ id, name }) => ({ id, name }))
    if (query && !row.name.toLowerCase().includes(query)) return []
    if (
      attributeNames.length > 0 &&
      !memberAttributes.some((attribute) => attributeNames.includes(attribute.name))
    ) {
      return []
    }
    return [{ row, memberAttributes }]
  })
  const items: ResearchMember[] = matched.slice(0, limit).map(({ row, memberAttributes }) => ({
    userId: row.userId,
    name: row.name,
    workspaceRole: row.workspaceRole,
    membershipStatus: row.membershipStatus,
    profileAttributes: memberAttributes,
    joinedAt: toIso(row.joinedAt).slice(0, 10),
    evidence: [memberEvidence(row.userId, row.name)],
  }))
  return {
    ok: true as const,
    items,
    returnedCount: items.length,
    totalCount: matched.length,
    truncated: isResearchTruncated(matched.length, items.length),
    appliedFilters: {
      query: query || null,
      attributeNames,
      attributeMatch: 'any' as const,
      includeInactive,
      limit,
    },
  }
}

export interface ResearchMemberHistoryProject {
  projectId: string
  title: string
  status: string | null
  role: ProjectMemberRole
  roleName: string
  startDate: string | null
  endDate: string | null
  archived: boolean
  files: Array<{ id: string; name: string; fileType: string; createdAt: string }>
  filesTruncated: boolean
  evidence: ResearchEvidence[]
}

export interface ResearchMemberHistory {
  userId: string
  name: string
  membershipStatus: 'active' | 'inactive'
  profileAttributes: ResearchProfileAttribute[]
  projects: ResearchMemberHistoryProject[]
  projectsTruncated: boolean
  evidence: ResearchEvidence[]
}

// メンバー詳細の参加プロジェクト一覧（`/api/workspaces/members/[userId]/projects`）と同じ範囲を、
// 比較表を作れるよう複数人まとめて返す。各プロジェクトの添付ファイルは read_file で本文を読める。
export async function getResearchMemberHistory(
  ctx: AuthContext,
  input: { userIds: string[]; includeFiles?: boolean | undefined },
) {
  const scope = await resolveScope(ctx)
  const requestedIds = [...new Set(input.userIds)]
  const userIds = requestedIds.slice(0, AI_RESEARCH_LIMITS.memberHistoryUsers)
  const includeFiles = input.includeFiles ?? true
  const visibleUserIds = await guestVisibleUserIds(ctx, scope)

  const {
    db,
    files,
    galleryItems,
    profiles,
    projectMembers,
    projectRoles,
    projects,
    projectStatuses,
    workspaceMembers,
  } = await import('@cairn/db')
  const { and, desc, eq, inArray, isNull, sql } = await import('drizzle-orm')
  const memberRows =
    userIds.length > 0
      ? await db
          .select({
            userId: profiles.id,
            name: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
            membershipStatus: workspaceMembers.membershipStatus,
          })
          .from(workspaceMembers)
          .innerJoin(profiles, eq(workspaceMembers.userId, profiles.id))
          .where(
            and(
              eq(workspaceMembers.workspaceId, ctx.workspaceId),
              inArray(workspaceMembers.userId, userIds),
            ),
          )
      : []
  // 非活性メンバーの履歴は管理者だけ。ゲストは見えるメンバーだけ（存在も明かさない）
  const visibleMembers = memberRows.filter(
    (row) =>
      (row.membershipStatus === 'active' || isWorkspaceAdmin(scope.role)) &&
      (!visibleUserIds || visibleUserIds.includes(row.userId)),
  )
  const visibleIds = visibleMembers.map((row) => row.userId)
  const notFoundUserIds = userIds.filter((id) => !visibleIds.includes(id))
  if (visibleIds.length === 0) {
    return {
      ok: true as const,
      items: [] satisfies ResearchMemberHistory[],
      returnedCount: 0,
      notFoundUserIds,
      truncated: requestedIds.length > userIds.length,
      appliedFilters: { includeFiles, maxUsers: AI_RESEARCH_LIMITS.memberHistoryUsers },
    }
  }

  const projectRows = await db
    .select({
      userId: projectMembers.userId,
      projectId: projects.id,
      title: projects.title,
      status: projectStatuses.name,
      role: projectMembers.role,
      roleName: projectRoles.name,
      startDate: projects.startDate,
      endDate: projects.endDate,
      archived: projects.archived,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
    .leftJoin(
      projectRoles,
      and(eq(projectMembers.roleId, projectRoles.id), eq(projectRoles.workspaceId, ctx.workspaceId)),
    )
    .where(
      and(
        inArray(projectMembers.userId, visibleIds),
        eq(projects.workspaceId, ctx.workspaceId),
        // ゲストは自分も参加するプロジェクトとの共通分だけ（参加していないプロジェクトの存在を漏らさない）
        scope.guestProjectIds ? inArray(projects.id, scope.guestProjectIds) : undefined,
      ),
    )
    .orderBy(sql`${projects.startDate} desc nulls last`, desc(projects.createdAt))

  const projectIds = [...new Set(projectRows.map((row) => row.projectId))]
  // プロジェクトの添付ファイル。画面のファイル一覧と同じく、ギャラリーの写真は除く
  const fileRows =
    includeFiles && projectIds.length > 0
      ? await db
          .select({
            id: files.id,
            projectId: files.projectId,
            name: files.fileName,
            fileType: files.fileType,
            metadata: files.metadata,
            createdAt: files.createdAt,
          })
          .from(files)
          .leftJoin(galleryItems, eq(galleryItems.fileId, files.id))
          .where(
            and(
              eq(files.workspaceId, ctx.workspaceId),
              inArray(files.projectId, projectIds),
              isNull(galleryItems.id),
            ),
          )
          .orderBy(desc(files.createdAt))
      : []
  const filesByProject = new Map<string, typeof fileRows>()
  for (const file of fileRows) {
    if (!file.projectId) continue
    const list = filesByProject.get(file.projectId) ?? []
    list.push(file)
    filesByProject.set(file.projectId, list)
  }
  const attributes = await getProfileAttributesByUserIds(ctx.workspaceId, visibleIds)

  let anyTruncated = requestedIds.length > userIds.length
  const items: ResearchMemberHistory[] = visibleMembers.map((member) => {
    const ownProjects = projectRows.filter((row) => row.userId === member.userId)
    const selected = ownProjects.slice(0, AI_RESEARCH_LIMITS.memberHistoryProjects)
    const projectsTruncated = ownProjects.length > selected.length
    if (projectsTruncated) anyTruncated = true
    return {
      userId: member.userId,
      name: member.name,
      membershipStatus: member.membershipStatus,
      profileAttributes: (attributes.get(member.userId) ?? []).map(({ id, name }) => ({ id, name })),
      projects: selected.map((row) => {
        const projectFiles = filesByProject.get(row.projectId) ?? []
        const shownFiles = projectFiles.slice(0, AI_RESEARCH_LIMITS.memberHistoryFilesPerProject)
        const filesTruncated = projectFiles.length > shownFiles.length
        if (filesTruncated) anyTruncated = true
        return {
          projectId: row.projectId,
          title: row.title,
          status: row.status ?? null,
          role: row.role,
          roleName: row.roleName ?? LEGACY_PROJECT_ROLE_NAMES[row.role],
          startDate: row.startDate,
          endDate: row.endDate,
          archived: row.archived,
          files: shownFiles.map((file) => ({
            id: file.id,
            name: file.name,
            fileType: file.fileType,
            createdAt: toIso(file.createdAt),
          })),
          filesTruncated,
          evidence: [
            projectEvidence(row.projectId, row.title),
            ...shownFiles.map((file) =>
              fileEvidence({
                id: file.id,
                label: file.name,
                projectId: row.projectId,
                externalUrl:
                  file.fileType === 'link'
                    ? safeExternalUrl(((file.metadata ?? {}) as Record<string, unknown>)['externalUrl'])
                    : null,
              }),
            ),
          ],
        }
      }),
      projectsTruncated,
      evidence: [memberEvidence(member.userId, member.name)],
    }
  })
  return {
    ok: true as const,
    items,
    returnedCount: items.length,
    notFoundUserIds,
    truncated: anyTruncated,
    appliedFilters: {
      includeFiles,
      maxUsers: AI_RESEARCH_LIMITS.memberHistoryUsers,
      maxProjectsPerUser: AI_RESEARCH_LIMITS.memberHistoryProjects,
      maxFilesPerProject: AI_RESEARCH_LIMITS.memberHistoryFilesPerProject,
    },
  }
}

export async function readResearchFile(
  ctx: AuthContext,
  input: { fileId: string; startChunk?: number | undefined; limit?: number | undefined },
) {
  const scope = await resolveScope(ctx)
  const outcome = await readFileContent({ ...ctx, role: scope.role }, {
    fileId: input.fileId,
    startChunk: Math.max(0, Math.floor(input.startChunk ?? 0)),
    limit: clampResearchLimit(input.limit, AI_RESEARCH_LIMITS.fileChunks),
  })
  if (!outcome.ok) {
    // 未インデックス・非対応形式は「読めなかった」ことを AI に明示し、空の本文として扱わせない
    return {
      ok: false as const,
      error: {
        code: outcome.status === 403 || outcome.status === 404 ? 'ACCESS_DENIED' : 'NOT_READABLE',
        message: outcome.error,
      },
    }
  }
  const { file, chunks, nextStartChunk } = outcome.value
  return {
    ok: true as const,
    file: { id: file.id, name: file.fileName, mimeType: file.mimeType, fileType: file.fileType },
    items: chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      evidence: fileEvidence({
        id: file.id,
        label: file.fileName,
        projectId: file.projectId,
        externalUrl: safeExternalUrl(file.externalUrl),
      }),
    })),
    returnedCount: chunks.length,
    nextStartChunk,
    truncated: nextStartChunk !== null,
  }
}
