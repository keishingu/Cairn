// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// Skill の呼び出し（docs/ai-automation-design.md §2.1・§2.9・§6）。
// `/ai` で `$名前` から始まる依頼を、そのスキルの指示文 + 許可した書き込みの tool で実行し、run を記録する。

import type { AiPendingActionType } from '@cairn/db'
import type { AuthContext } from '@/lib/get-auth-context'
import { isWorkspaceMember } from '@/lib/permissions'
import { AUTOMATION_WRITE_ACTIONS, type AutomationWriteAction } from './automations'
import { hydrateInstructionReferences } from './instruction-references'

// ワークスペースあたり、ユーザー定義オートメーションの実行は JST の暦日で1日100回まで（§2.9）
export const AI_AUTOMATION_DAILY_RUN_LIMIT = 100

const SKILL_INVOCATION_RE = /^\s*\$([a-z0-9][a-z0-9-]{0,39})(?=\s|$)([\s\S]*)$/

/** 依頼の先頭の `$名前` を切り出す。名前の後ろは、そのスキルへの追加の依頼として渡す */
export function parseSkillInvocation(text: string): { name: string; request: string } | null {
  const match = SKILL_INVOCATION_RE.exec(text)
  if (!match) return null
  return { name: match[1]!, request: (match[2] ?? '').trim() }
}

export interface SkillDefinition {
  id: string
  name: string
  instruction: string
  writeActions: AutomationWriteAction[]
}

export class SkillRunError extends Error {
  constructor(
    readonly status: 403 | 404 | 409 | 429,
    message: string,
  ) {
    super(message)
  }
}

/** 呼び出せるスキルを引く。ゲストには一覧も見せないため、呼び出しも member 以上にする（§2.5） */
export async function resolveSkill(ctx: AuthContext, name: string): Promise<SkillDefinition> {
  if (!isWorkspaceMember(ctx.role)) {
    throw new SkillRunError(403, 'スキルを呼び出せるのはメンバー以上です（ゲストは呼び出せません）')
  }
  const { aiAutomations, db } = await import('@cairn/db')
  const { and, eq, isNull } = await import('drizzle-orm')
  const [row] = await db
    .select({
      id: aiAutomations.id,
      name: aiAutomations.name,
      instruction: aiAutomations.rawInstruction,
      compiled: aiAutomations.compiled,
      enabled: aiAutomations.enabled,
    })
    .from(aiAutomations)
    .where(
      and(
        eq(aiAutomations.workspaceId, ctx.workspaceId),
        eq(aiAutomations.name, name),
        eq(aiAutomations.kind, 'skill'),
        isNull(aiAutomations.builtin),
      ),
    )
    .limit(1)
  if (!row) throw new SkillRunError(404, `スキル $${name} が見つかりません。設定の「AIオートメーション」で確認してください`)
  if (!row.enabled) throw new SkillRunError(409, `スキル $${name} は停止中です`)
  const value = row.compiled['writeActions']
  // 参照は ID と名前の両方を AI に渡す（ID で tool を呼べ、名前で依頼を理解できる）
  const [instruction = ''] = await hydrateInstructionReferences(ctx, [row.instruction ?? ''])
  return {
    id: row.id,
    name: row.name,
    instruction,
    writeActions: Array.isArray(value) ? AUTOMATION_WRITE_ACTIONS.filter((action) => value.includes(action)) : [],
  }
}

function jstDayStart(now: Date): Date {
  const jstDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return new Date(`${jstDate}T00:00:00+09:00`)
}

/**
 * run を予約する。上限の確認と予約をワークスペース単位で直列化し、同時に呼んでも上限を超えない。
 * 上限に達した呼び出しも skipped として記録する（§2.9。dry-run・silent も1回に数える）
 */
export async function reserveSkillRun(
  ctx: AuthContext,
  skill: SkillDefinition,
  input: { triggerKey: string; dryRun: boolean },
  now = new Date(),
): Promise<string> {
  const { aiAutomationRuns, aiAutomations, db } = await import('@cairn/db')
  const { and, count, eq, gte, isNull, sql } = await import('drizzle-orm')
  const reserved = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai-automation-runs:${ctx.workspaceId}`}))`)
    const [{ value } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(aiAutomationRuns)
      .innerJoin(aiAutomations, eq(aiAutomations.id, aiAutomationRuns.automationId))
      .where(
        and(
          eq(aiAutomations.workspaceId, ctx.workspaceId),
          isNull(aiAutomations.builtin),
          gte(aiAutomationRuns.startedAt, jstDayStart(now)),
          sql`${aiAutomationRuns.status} <> 'skipped'`,
        ),
      )
    const overLimit = Number(value) >= AI_AUTOMATION_DAILY_RUN_LIMIT
    const [row] = await tx
      .insert(aiAutomationRuns)
      .values({
        automationId: skill.id,
        triggerKey: input.triggerKey,
        triggeredBy: ctx.userId,
        dryRun: input.dryRun,
        status: overLimit ? 'skipped' : 'running',
        ...(overLimit ? { error: 'daily_limit_reached', finishedAt: now } : {}),
      })
      .returning({ id: aiAutomationRuns.id })
    if (!row) throw new Error('ai_automation_runs insert returned no rows')
    return { id: row.id, overLimit }
  })
  if (reserved.overLimit) {
    throw new SkillRunError(
      429,
      `このワークスペースの今日のオートメーション実行回数が上限（${AI_AUTOMATION_DAILY_RUN_LIMIT}回）に達しました。明日もう一度お試しください`,
    )
  }
  return reserved.id
}

export async function finishSkillRun(
  runId: string,
  result: {
    status: 'success' | 'failed'
    evidence?: unknown[]
    output?: Record<string, unknown>
    error?: string | null
    creditsUsed?: number | null
  },
): Promise<void> {
  const { aiAutomationRuns, aiAutomations, db } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const finishedAt = new Date()
  const [run] = await db
    .update(aiAutomationRuns)
    .set({
      status: result.status,
      evidence: result.evidence ?? [],
      ...(result.output ? { output: result.output } : {}),
      error: result.error ?? null,
      creditsUsed: result.creditsUsed ?? null,
      finishedAt,
    })
    .where(eq(aiAutomationRuns.id, runId))
    .returning({ automationId: aiAutomationRuns.automationId })
  if (run) {
    await db.update(aiAutomations).set({ lastRunAt: finishedAt }).where(eq(aiAutomations.id, run.automationId))
  }
}

/**
 * tool の結果から、読んだ根拠（evidence DTO）を重複なく集める（§2.3。run の監査と、後の配信前検証に使う）。
 * 本文の文字列からは判定しない
 */
export function collectEvidence(results: unknown[]): Array<Record<string, unknown>> {
  const seen = new Set<string>()
  const evidence: Array<Record<string, unknown>> = []
  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || typeof value !== 'object' || value === null) return
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    const record = value as Record<string, unknown>
    if (typeof record['type'] === 'string' && typeof record['id'] === 'string' && typeof record['href'] === 'string') {
      const key = `${record['type']}:${record['id']}`
      if (!seen.has(key)) {
        seen.add(key)
        evidence.push({ type: record['type'], id: record['id'], label: record['label'] ?? null })
      }
      return
    }
    for (const nested of Object.values(record)) visit(nested, depth + 1)
  }
  for (const result of results) visit(result, 0)
  return evidence
}

export function skillWriteActions(skill: SkillDefinition): AiPendingActionType[] {
  return [...skill.writeActions]
}
