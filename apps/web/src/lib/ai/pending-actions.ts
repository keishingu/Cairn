// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// AI が作った書き込みの実行案（承認カード）。docs/ai-automation-design.md §2.4。
// AI は実行案を作るだけで、承認者が承認したときに承認者の権限で実行する。
// プロジェクト・タスクの操作は既存の Route Handler を承認者のリクエストの中で呼び、画面からの操作と同じ認可・検証・通知を通す。
// チャンネル投稿だけは承認者の名義にせず、Cairn AI の Bot が「○○さんが承認」を添えて投稿する。

import { z } from 'zod'
import type { AiPendingActionStatus, AiPendingActionType } from '@cairn/db'
import type { AuthContext } from '@/lib/get-auth-context'
import { extractMentionIds } from '@/lib/chat/mentions'
import { canAccessChannel, isWorkspaceMember } from '@/lib/permissions'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'

export const PENDING_ACTION_TTL_DAYS = 7
export const POST_MESSAGE_MAX_LENGTH = 4000

export const pendingActionPayloadSchemas = {
  post_message: z.object({
    channelId: z.string().uuid(),
    text: z.string().trim().min(1).max(POST_MESSAGE_MAX_LENGTH),
  }),
  invite_project_member: z.object({
    projectId: z.string().uuid(),
    userId: z.string().uuid(),
    roleId: z.string().uuid().nullable(),
  }),
  set_project_member_role: z.object({
    projectId: z.string().uuid(),
    userId: z.string().uuid(),
    roleId: z.string().uuid(),
  }),
  create_task: z.object({
    title: z.string().trim().min(1).max(200),
    projectId: z.string().uuid().nullable(),
    channelId: z.string().uuid().nullable(),
    description: z.string().max(2000).nullable(),
    priority: z.enum(['high', 'medium', 'low']),
    assigneeId: z.string().uuid().nullable(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  }),
} satisfies Record<AiPendingActionType, z.ZodTypeAny>

export type PendingActionPayload<T extends AiPendingActionType> = z.infer<
  (typeof pendingActionPayloadSchemas)[T]
>

// 承認カードで承認者が書き換えてよい項目。宛先・対象（チャンネル・プロジェクト・人・役割）は変えさせず、却下して頼み直してもらう
const editableFields: Record<AiPendingActionType, readonly string[]> = {
  post_message: ['text'],
  invite_project_member: [],
  set_project_member_role: [],
  create_task: ['title', 'description'],
}

export class PendingActionError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message)
  }
}

export function parsePendingActionPayload(type: AiPendingActionType, payload: unknown) {
  const parsed = pendingActionPayloadSchemas[type].safeParse(payload)
  if (!parsed.success) throw new PendingActionError(422, '実行案の内容が不正です')
  if (type === 'create_task') {
    const task = parsed.data as PendingActionPayload<'create_task'>
    if (task.projectId && task.channelId) {
      throw new PendingActionError(422, 'タスクはプロジェクトかチャンネルのどちらか一方に作成してください')
    }
  }
  return parsed.data as Record<string, unknown>
}

export function applyPendingActionEdits(
  type: AiPendingActionType,
  payload: Record<string, unknown>,
  edits: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!edits) return payload
  const allowed = editableFields[type]
  const disallowed = Object.keys(edits).filter((key) => !allowed.includes(key))
  if (disallowed.length > 0) {
    throw new PendingActionError(422, `この実行案では ${disallowed.join(', ')} を編集できません`)
  }
  return parsePendingActionPayload(type, { ...payload, ...edits })
}

export interface PendingActionDisplay {
  channel?: { id: string; name: string } | null
  project?: { id: string; title: string } | null
  user?: { id: string; name: string } | null
  assignee?: { id: string; name: string } | null
  role?: { id: string; name: string } | null
  // 投稿本文のメンション先の名前（承認カードで `<@id>` を名前で見せる）。見えない人は含めない
  mentionNames?: Record<string, string>
}

export interface PendingActionDto {
  id: string
  actionType: AiPendingActionType
  status: AiPendingActionStatus
  payload: Record<string, unknown>
  reason: string | null
  display: PendingActionDisplay
  editableFields: readonly string[]
  result: Record<string, unknown> | null
  error: string | null
  expiresAt: string
  decidedAt: string | null
  executedAt: string | null
}

type PendingActionRow = {
  id: string
  workspaceId: string
  approverId: string
  actionType: AiPendingActionType
  status: AiPendingActionStatus
  payload: Record<string, unknown>
  reason: string | null
  result: Record<string, unknown> | null
  error: string | null
  expiresAt: Date
  decidedAt: Date | null
  executedAt: Date | null
}

async function channelName(ctx: AuthContext, channelId: string) {
  if (!(await canAccessChannel(ctx.workspaceId, ctx.userId, channelId, ctx.role))) return null
  const { channels, db, milestones, projects } = await import('@cairn/db')
  const { eq, sql } = await import('drizzle-orm')
  const [row] = await db
    .select({
      id: channels.id,
      type: channels.type,
      name: sql<string>`case when ${channels.parentChannelId} is not null then coalesce(${channels.name}, '名称なし')
        else coalesce(${milestones.title}, ${projects.title}, ${channels.name}, '名称なし') end`,
    })
    .from(channels)
    .leftJoin(projects, eq(channels.projectId, projects.id))
    .leftJoin(milestones, eq(channels.milestoneId, milestones.id))
    .where(eq(channels.id, channelId))
    .limit(1)
  if (!row || row.type === 'dm') return null
  return { id: row.id, name: row.name }
}

async function projectTitle(ctx: AuthContext, projectId: string) {
  const { db, projectMembers, projects } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [project] = await db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!project) return null
  if (ctx.role === 'guest') {
    const [membership] = await db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, ctx.userId)))
      .limit(1)
    if (!membership) return null
  }
  return project
}

async function memberName(ctx: AuthContext, userId: string) {
  const { activeWorkspaceMembers, db, profiles, workspaceMembers } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [row] = await db
    .select({
      id: profiles.id,
      name: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
    })
    .from(activeWorkspaceMembers)
    .innerJoin(profiles, eq(profiles.id, activeWorkspaceMembers.userId))
    .leftJoin(
      workspaceMembers,
      and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
    )
    .where(and(eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId), eq(activeWorkspaceMembers.userId, userId)))
    .limit(1)
  return row ?? null
}

async function roleName(ctx: AuthContext, roleId: string) {
  const { db, projectRoles } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [row] = await db
    .select({ id: projectRoles.id, name: projectRoles.name })
    .from(projectRoles)
    .where(and(eq(projectRoles.id, roleId), eq(projectRoles.workspaceId, ctx.workspaceId)))
    .limit(1)
  return row ?? null
}

/**
 * 承認カードに出す名前を、承認者に見える範囲で引く。見えない・無くなった対象は null にし、
 * カードは「対象が見つからない」と表示する（内部 ID だけを見せない）
 */
export async function describePendingAction(
  ctx: AuthContext,
  type: AiPendingActionType,
  payload: Record<string, unknown>,
): Promise<PendingActionDisplay> {
  const value = (key: string) => (typeof payload[key] === 'string' ? (payload[key] as string) : null)
  const channelId = value('channelId')
  const projectId = value('projectId')
  const userId = value('userId')
  const roleId = value('roleId')
  const assigneeId = value('assigneeId')
  const text = type === 'post_message' ? value('text') : null
  const mentionIds = text ? [...new Set(extractMentionIds(text))].slice(0, 50) : []
  const [channel, project, user, role, assignee, mentioned] = await Promise.all([
    channelId ? channelName(ctx, channelId) : undefined,
    projectId ? projectTitle(ctx, projectId) : undefined,
    userId ? memberName(ctx, userId) : undefined,
    roleId ? roleName(ctx, roleId) : undefined,
    type === 'create_task' && assigneeId ? memberName(ctx, assigneeId) : undefined,
    Promise.all(mentionIds.map((id) => memberName(ctx, id))),
  ])
  return {
    ...(channel !== undefined ? { channel } : {}),
    ...(project !== undefined ? { project } : {}),
    ...(user !== undefined ? { user } : {}),
    ...(role !== undefined ? { role } : {}),
    ...(assignee !== undefined ? { assignee } : {}),
    ...(text !== null
      ? { mentionNames: Object.fromEntries(mentioned.flatMap((member) => (member ? [[member.id, member.name]] : []))) }
      : {}),
  }
}

function missingTargets(display: PendingActionDisplay): string[] {
  const labels: Record<Exclude<keyof PendingActionDisplay, 'mentionNames'>, string> = {
    channel: 'チャンネル',
    project: 'プロジェクト',
    user: 'メンバー',
    assignee: '担当者',
    role: 'プロジェクトの役割',
  }
  return (Object.keys(labels) as Array<keyof typeof labels>)
    .filter((key) => display[key] === null)
    .map((key) => labels[key])
}

/**
 * 実行案を作る。AI が作った内容をそのまま保存せず、承認者に見える対象だけを指していることを確かめる
 * （見えない対象を指す案は作らず、AI に誤りとして返す）
 */
export async function proposePendingAction(
  ctx: AuthContext,
  input: {
    conversationId: string | null
    actionType: AiPendingActionType
    payload: unknown
    reason?: string | null | undefined
  },
  now = new Date(),
): Promise<PendingActionDto> {
  const payload = parsePendingActionPayload(input.actionType, input.payload)
  const display = await describePendingAction(ctx, input.actionType, payload)
  const missing = missingTargets(display)
  if (missing.length > 0) {
    throw new PendingActionError(404, `${missing.join('・')}が見つからないか、アクセスできません`)
  }
  const { aiPendingActions, db } = await import('@cairn/db')
  const expiresAt = new Date(now.getTime() + PENDING_ACTION_TTL_DAYS * 86_400_000)
  const [row] = await db
    .insert(aiPendingActions)
    .values({
      workspaceId: ctx.workspaceId,
      conversationId: input.conversationId,
      approverId: ctx.userId,
      actionType: input.actionType,
      payload,
      reason: input.reason?.trim().slice(0, 1000) || null,
      expiresAt,
    })
    .returning()
  if (!row) throw new Error('ai_pending_actions insert returned no rows')
  return toDto(row as PendingActionRow, display)
}

function toDto(row: PendingActionRow, display: PendingActionDisplay): PendingActionDto {
  return {
    id: row.id,
    actionType: row.actionType,
    status: row.status,
    payload: row.payload,
    reason: row.reason,
    display,
    editableFields: editableFields[row.actionType],
    result: row.result,
    error: row.error,
    expiresAt: row.expiresAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    executedAt: row.executedAt?.toISOString() ?? null,
  }
}

// 実行案は承認者本人にしか見せない。他人の実行案は存在も明かさず 404 にする
async function loadOwnPendingAction(ctx: AuthContext, id: string): Promise<PendingActionRow> {
  const { aiPendingActions, db } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [row] = await db
    .select()
    .from(aiPendingActions)
    .where(
      and(
        eq(aiPendingActions.id, id),
        eq(aiPendingActions.workspaceId, ctx.workspaceId),
        eq(aiPendingActions.approverId, ctx.userId),
      ),
    )
    .limit(1)
  if (!row) throw new PendingActionError(404, '実行案が見つかりません')
  return row as PendingActionRow
}

async function expireIfStale(row: PendingActionRow, now: Date): Promise<PendingActionRow> {
  if (row.status !== 'pending' || row.expiresAt > now) return row
  const { aiPendingActions, db } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [updated] = await db
    .update(aiPendingActions)
    .set({ status: 'expired', updatedAt: now })
    .where(and(eq(aiPendingActions.id, row.id), eq(aiPendingActions.status, 'pending')))
    .returning()
  return (updated as PendingActionRow | undefined) ?? row
}

export async function getPendingAction(ctx: AuthContext, id: string, now = new Date()) {
  const row = await expireIfStale(await loadOwnPendingAction(ctx, id), now)
  return toDto(row, await describePendingAction(ctx, row.actionType, row.payload))
}

export async function rejectPendingAction(ctx: AuthContext, id: string, now = new Date()) {
  const row = await expireIfStale(await loadOwnPendingAction(ctx, id), now)
  if (row.status !== 'pending') throw new PendingActionError(409, decidedMessage(row.status))
  const { aiPendingActions, db } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [updated] = await db
    .update(aiPendingActions)
    .set({ status: 'rejected', decidedAt: now, updatedAt: now })
    .where(and(eq(aiPendingActions.id, id), eq(aiPendingActions.status, 'pending')))
    .returning()
  if (!updated) throw new PendingActionError(409, 'この実行案はすでに処理されています')
  return toDto(updated as PendingActionRow, await describePendingAction(ctx, row.actionType, row.payload))
}

function decidedMessage(status: AiPendingActionStatus): string {
  switch (status) {
    case 'expired':
      return `この実行案は期限（${PENDING_ACTION_TTL_DAYS}日）が切れています。もう一度 AI に頼んでください`
    case 'rejected':
      return 'この実行案は却下済みです'
    default:
      return 'この実行案はすでに処理されています'
  }
}

export type PendingActionExecutor = (
  ctx: AuthContext,
  action: { id: string; actionType: AiPendingActionType; payload: Record<string, unknown> },
) => Promise<Record<string, unknown>>

/**
 * 承認して実行する。pending → executing の遷移を1つの UPDATE で取り、二重の承認・承認と却下の競合では片方だけを進める。
 * 実行の失敗は failed として理由を残し、承認カードに表示する（成功したように見せない）。
 * 失敗した案は再実行しない。部分的に成功した操作を重ねないよう、AI にもう一度頼んで新しい案にしてもらう
 */
export async function approvePendingAction(
  ctx: AuthContext,
  id: string,
  edits: Record<string, unknown> | undefined,
  execute: PendingActionExecutor,
  now = new Date(),
) {
  const row = await expireIfStale(await loadOwnPendingAction(ctx, id), now)
  if (row.status !== 'pending') throw new PendingActionError(409, decidedMessage(row.status))
  const payload = applyPendingActionEdits(row.actionType, row.payload, edits)

  const { aiPendingActions, db } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [claimed] = await db
    .update(aiPendingActions)
    .set({ status: 'executing', payload, decidedAt: now, updatedAt: now })
    .where(and(eq(aiPendingActions.id, id), eq(aiPendingActions.status, 'pending')))
    .returning()
  if (!claimed) throw new PendingActionError(409, 'この実行案はすでに処理されています')

  let finished: PendingActionRow
  try {
    const result = await execute(ctx, { id, actionType: row.actionType, payload })
    const [done] = await db
      .update(aiPendingActions)
      .set({ status: 'executed', result, executedAt: new Date(), updatedAt: new Date() })
      .where(eq(aiPendingActions.id, id))
      .returning()
    finished = done as PendingActionRow
  } catch (error) {
    const message =
      error instanceof PendingActionError ? error.message : '実行に失敗しました。時間をおいて AI にもう一度頼んでください'
    if (!(error instanceof PendingActionError)) console.error('[ai pending action] execute failed', error)
    const [failed] = await db
      .update(aiPendingActions)
      .set({ status: 'failed', error: message, updatedAt: new Date() })
      .where(eq(aiPendingActions.id, id))
      .returning()
    finished = failed as PendingActionRow
  }
  return toDto(finished, await describePendingAction(ctx, finished.actionType, finished.payload))
}

/** 承認者がそのチャンネルへ Cairn AI を追加して投稿させてよいか（アプリをチャンネルへ追加できるのは member 以上） */
export async function assertCanApproveChannelPost(ctx: AuthContext, channelId: string) {
  if (!isWorkspaceMember(ctx.role)) {
    throw new PendingActionError(403, 'ゲストは Cairn AI の投稿を承認できません')
  }
  if (!(await canAccessChannel(ctx.workspaceId, ctx.userId, channelId, ctx.role))) {
    throw new PendingActionError(403, 'このチャンネルにアクセスする権限がありません')
  }
}
