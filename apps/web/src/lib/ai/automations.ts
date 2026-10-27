// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// AI オートメーションの定義（docs/ai-automation-design.md §2.5・§4・§6）。
// 作成・編集・停止・削除は admin 以上、一覧は member 以上が見られる（誰が何をさせているかを隠さない。§2.6）。
// この段階で作れるのは Skill だけ。cron / heartbeat は Phase 3・4 で足す。

import { z } from 'zod'
import type { AiAutomationKind, AiPendingActionType } from '@cairn/db'
import type { AuthContext } from '@/lib/get-auth-context'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'

// ワークスペースあたりのユーザー定義オートメーションの上限（§2.9）。組み込みの PMO は数えない
export const AI_AUTOMATION_DEFINITION_LIMIT = 20
export const AI_AUTOMATION_INSTRUCTION_MAX_LENGTH = 10_000

// Skill に許せる書き込み。どれも承認カードを通す（§2.4）
export const AUTOMATION_WRITE_ACTIONS = [
  'post_message',
  'invite_project_member',
  'set_project_member_role',
  'create_task',
] as const satisfies readonly AiPendingActionType[]

export const automationNameSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, '名前は半角英小文字・数字・ハイフンで40文字以内にしてください（先頭は英数字）')

const instructionSchema = z
  .string()
  .trim()
  .min(1, '指示文を入力してください')
  .max(AI_AUTOMATION_INSTRUCTION_MAX_LENGTH, `指示文は${AI_AUTOMATION_INSTRUCTION_MAX_LENGTH.toLocaleString()}文字以内にしてください`)

const writeActionsSchema = z
  .array(z.enum(AUTOMATION_WRITE_ACTIONS))
  .transform((actions) => AUTOMATION_WRITE_ACTIONS.filter((action) => actions.includes(action)))

export const createAutomationSchema = z
  .object({
    kind: z.literal('skill', { errorMap: () => ({ message: '現在作成できるのは Skill だけです' }) }),
    name: automationNameSchema,
    instruction: instructionSchema,
    writeActions: writeActionsSchema,
  })
  .strict()

export const updateAutomationSchema = z
  .object({
    name: automationNameSchema.optional(),
    instruction: instructionSchema.optional(),
    writeActions: writeActionsSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, '変更する項目を指定してください')

export type AutomationWriteAction = (typeof AUTOMATION_WRITE_ACTIONS)[number]

export interface AutomationDto {
  id: string
  kind: AiAutomationKind
  name: string
  instruction: string
  writeActions: AutomationWriteAction[]
  enabled: boolean
  pausedReason: string | null
  createdBy: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

export class AutomationError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message)
  }
}

function compiledWriteActions(compiled: Record<string, unknown>): AutomationWriteAction[] {
  const value = compiled['writeActions']
  if (!Array.isArray(value)) return []
  return AUTOMATION_WRITE_ACTIONS.filter((action) => value.includes(action))
}

async function selectAutomations(ctx: AuthContext, id?: string) {
  const { aiAutomations, db, profiles, workspaceMembers } = await import('@cairn/db')
  const { and, asc, eq, isNull } = await import('drizzle-orm')
  const rows = await db
    .select({
      id: aiAutomations.id,
      kind: aiAutomations.kind,
      name: aiAutomations.name,
      instruction: aiAutomations.rawInstruction,
      compiled: aiAutomations.compiled,
      enabled: aiAutomations.enabled,
      pausedReason: aiAutomations.pausedReason,
      createdById: aiAutomations.createdBy,
      // 作成者は非活性になっても履歴上の名義として表示する（user-deactivation-design.md）
      createdByName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
      createdAt: aiAutomations.createdAt,
      updatedAt: aiAutomations.updatedAt,
    })
    .from(aiAutomations)
    .leftJoin(profiles, eq(profiles.id, aiAutomations.createdBy))
    .leftJoin(
      workspaceMembers,
      and(eq(workspaceMembers.userId, aiAutomations.createdBy), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
    )
    .where(
      and(
        eq(aiAutomations.workspaceId, ctx.workspaceId),
        // 組み込みの PMO（Phase 2）はこの一覧の対象外
        isNull(aiAutomations.builtin),
        id ? eq(aiAutomations.id, id) : undefined,
      ),
    )
    .orderBy(asc(aiAutomations.name))
  return rows.map(
    (row): AutomationDto => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      instruction: row.instruction ?? '',
      writeActions: compiledWriteActions(row.compiled),
      enabled: row.enabled,
      pausedReason: row.pausedReason,
      createdBy: row.createdById && row.createdByName ? { id: row.createdById, name: row.createdByName } : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }),
  )
}

export async function listAutomations(ctx: AuthContext): Promise<AutomationDto[]> {
  return selectAutomations(ctx)
}

async function getAutomation(ctx: AuthContext, id: string): Promise<AutomationDto> {
  const [automation] = await selectAutomations(ctx, id)
  if (!automation) throw new AutomationError(404, 'オートメーションが見つかりません')
  return automation
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown; cause?: { code?: unknown } } | null)
  return code?.code === '23505' || code?.cause?.code === '23505'
}

export async function createAutomation(
  ctx: AuthContext,
  input: z.infer<typeof createAutomationSchema>,
): Promise<AutomationDto> {
  const { aiAutomations, db } = await import('@cairn/db')
  const { and, count, eq, isNull, sql } = await import('drizzle-orm')
  let id: string
  try {
    id = await db.transaction(async (tx) => {
      // 上限の確認と作成を、ワークスペース単位で直列化する（同時作成で上限を超えない）
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai-automations:${ctx.workspaceId}`}))`)
      const [{ value } = { value: 0 }] = await tx
        .select({ value: count() })
        .from(aiAutomations)
        .where(and(eq(aiAutomations.workspaceId, ctx.workspaceId), isNull(aiAutomations.builtin)))
      if (Number(value) >= AI_AUTOMATION_DEFINITION_LIMIT) {
        throw new AutomationError(
          422,
          `オートメーションは1つのワークスペースに${AI_AUTOMATION_DEFINITION_LIMIT}件までです。不要なものを削除してください`,
        )
      }
      const [row] = await tx
        .insert(aiAutomations)
        .values({
          workspaceId: ctx.workspaceId,
          kind: input.kind,
          name: input.name,
          rawInstruction: input.instruction,
          compiled: { writeActions: input.writeActions },
          createdBy: ctx.userId,
        })
        .returning({ id: aiAutomations.id })
      if (!row) throw new Error('ai_automations insert returned no rows')
      return row.id
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new AutomationError(409, `$${input.name} はすでに使われています`)
    throw error
  }
  return getAutomation(ctx, id)
}

export async function updateAutomation(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof updateAutomationSchema>,
): Promise<AutomationDto> {
  const current = await getAutomation(ctx, id)
  const { aiAutomations, db } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  try {
    await db
      .update(aiAutomations)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.instruction !== undefined ? { rawInstruction: input.instruction } : {}),
        ...(input.writeActions !== undefined ? { compiled: { writeActions: input.writeActions } } : {}),
        ...(input.enabled !== undefined
          ? // 手動で再開したら、作成者の権限喪失などで止まった理由も消す
            { enabled: input.enabled, ...(input.enabled ? { pausedReason: null } : {}) }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(aiAutomations.id, id), eq(aiAutomations.workspaceId, ctx.workspaceId)))
  } catch (error) {
    if (isUniqueViolation(error)) throw new AutomationError(409, `$${input.name ?? current.name} はすでに使われています`)
    throw error
  }
  return getAutomation(ctx, id)
}

export async function deleteAutomation(ctx: AuthContext, id: string): Promise<void> {
  await getAutomation(ctx, id)
  const { aiAutomations, db } = await import('@cairn/db')
  const { and, eq, isNull } = await import('drizzle-orm')
  await db
    .delete(aiAutomations)
    .where(and(eq(aiAutomations.id, id), eq(aiAutomations.workspaceId, ctx.workspaceId), isNull(aiAutomations.builtin)))
}
