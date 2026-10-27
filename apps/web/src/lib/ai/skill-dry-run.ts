// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// スキルのテスト実行（dry-run。docs/ai-automation-design.md §2.9）。実際にツールで読み、判断まで行うが、
// 実行案は保存せず承認カードも出さない。結果は設定画面にだけ返し、run にも残す。クレジットと実行回数は消費する。

import { generateText } from 'ai'
import { BILLING_CONFIG } from '@cairn/core/billing'
import { isAiChatModel } from '@cairn/shared'
import { buildChatSystemPrompt } from '@/app/api/ai/conversations/[id]/messages/system-prompt'
import { refundActiveBenefitReservation, reserveCreditsForActiveBenefit } from '@/lib/billing/credits'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import type { AuthContext } from '@/lib/get-auth-context'
import { apiKeyEnvForChatModel, chatLanguageModel } from './client'
import type { PendingActionDisplay } from './pending-actions'
import { createProposalTools, type DryRunProposal } from './proposal-tools'
import { AI_RESEARCH_LIMITS } from './research'
import { createResearchTools } from './research-tools'
import { SkillRunError, collectEvidence, finishSkillRun, reserveSkillRun, type SkillDefinition } from './skill-run'
import { AUTOMATION_WRITE_ACTIONS } from './automations'

export interface DryRunResultDto {
  runId: string
  text: string
  proposals: Array<{ actionType: string; payload: Record<string, unknown>; display: PendingActionDisplay; reason: string | null }>
  evidence: Array<Record<string, unknown>>
  toolCalls: Array<{ toolName: string; ok: boolean }>
}

export class DryRunError extends Error {
  constructor(
    readonly status: 402 | 403 | 404 | 409 | 429 | 500 | 503,
    message: string,
  ) {
    super(message)
  }
}

async function loadSkillForDryRun(ctx: AuthContext, id: string): Promise<SkillDefinition> {
  const { aiAutomations, db } = await import('@cairn/db')
  const { and, eq, isNull } = await import('drizzle-orm')
  const [row] = await db
    .select({ id: aiAutomations.id, name: aiAutomations.name, kind: aiAutomations.kind, instruction: aiAutomations.rawInstruction, compiled: aiAutomations.compiled })
    .from(aiAutomations)
    .where(and(eq(aiAutomations.id, id), eq(aiAutomations.workspaceId, ctx.workspaceId), isNull(aiAutomations.builtin)))
    .limit(1)
  if (!row || row.kind !== 'skill') throw new DryRunError(404, 'スキルが見つかりません')
  const value = row.compiled['writeActions']
  return {
    id: row.id,
    name: row.name,
    instruction: row.instruction ?? '',
    writeActions: Array.isArray(value) ? AUTOMATION_WRITE_ACTIONS.filter((action) => value.includes(action)) : [],
  }
}

/**
 * スキルを停止中でもテストできる（設定を直してから再開する前に試すため）。実行するのは呼んだ admin 本人の権限
 */
export async function dryRunSkill(ctx: AuthContext, id: string, request: string): Promise<DryRunResultDto> {
  const skill = await loadSkillForDryRun(ctx, id)
  const { db, workspaces } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const [workspace] = await db
    .select({ aiChatModel: workspaces.aiChatModel, aiChatSystemPrompt: workspaces.aiChatSystemPrompt })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspaceId))
    .limit(1)
  if (!workspace || !isAiChatModel(workspace.aiChatModel)) {
    throw new DryRunError(500, 'ワークスペースの AI モデル設定を読み込めませんでした')
  }
  const apiKeyEnv = apiKeyEnvForChatModel(workspace.aiChatModel)
  if (!process.env[apiKeyEnv]) throw new DryRunError(503, `${apiKeyEnv} が設定されていません`)

  const triggerKey = `dry:${crypto.randomUUID()}`
  const credits = BILLING_CONFIG.activeAiRequestCredits
  if (!(await reserveCreditsForActiveBenefit(ctx.workspaceId, credits, triggerKey))) {
    throw new DryRunError(402, 'ワークスペースのクレジットが不足しています。設定の請求から石を追加してください。')
  }
  let runId: string
  try {
    runId = await reserveSkillRun(ctx, skill, { triggerKey, dryRun: true })
  } catch (error) {
    await refundActiveBenefitReservation(ctx.workspaceId, credits, triggerKey)
    if (error instanceof SkillRunError) throw new DryRunError(error.status, error.message)
    throw error
  }

  const dryRun = { proposals: [] as DryRunProposal[] }
  try {
    const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'full', timeStyle: 'short' })
    const result = await generateText({
      model: chatLanguageModel(workspace.aiChatModel),
      system: buildChatSystemPrompt({
        now,
        role: ctx.role,
        contextSection: '',
        hasWebSearch: false,
        workspaceInstructions: workspace.aiChatSystemPrompt,
        skill,
      }),
      messages: [{ role: 'user', content: `$${skill.name}${request.trim() ? ` ${request.trim()}` : ''}` }],
      tools: {
        ...createResearchTools(ctx),
        ...createProposalTools(ctx, null, { allowed: skill.writeActions, dryRun }),
      },
      maxSteps: AI_RESEARCH_LIMITS.skillToolSteps,
    })
    const toolResults = result.steps.flatMap((step) => step.toolResults)
    const evidence = collectEvidence(toolResults.map((toolResult) => toolResult.result as unknown))
    const output: DryRunResultDto = {
      runId,
      text: result.text,
      proposals: dryRun.proposals,
      evidence,
      toolCalls: toolResults.map((toolResult) => ({
        toolName: toolResult.toolName,
        ok: (toolResult.result as { ok?: unknown } | null)?.ok !== false,
      })),
    }
    await finishSkillRun(runId, {
      status: 'success',
      evidence,
      output: { text: output.text, proposals: output.proposals, toolCalls: output.toolCalls },
      creditsUsed: isBillingEnabled() ? credits : null,
    })
    return output
  } catch (error) {
    console.error('[skill dry-run] failed', error)
    await refundActiveBenefitReservation(ctx.workspaceId, credits, triggerKey).catch(() => undefined)
    await finishSkillRun(runId, { status: 'failed', error: error instanceof Error ? error.message.slice(0, 500) : 'unknown' })
    throw new DryRunError(500, 'テスト実行に失敗しました。時間をおいてもう一度お試しください')
  }
}
