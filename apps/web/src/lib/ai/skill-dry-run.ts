// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// スキルのテスト実行（dry-run。docs/ai-automation-design.md §2.9）。実際にツールで読み、判断まで行うが、
// 実行案は保存せず承認カードも出さない。結果は設定画面にだけ返し、run にも残す。クレジットと実行回数は消費する。

import { generateText } from 'ai'
import { chatRequestCredits } from './chat-model'
import { chatUsageCharge, recordChatUsageAfterResponse, type ChatUsageStep } from './chat-usage'
import { isAiChatModel } from '@cairn/shared'
import { buildChatModelMessages, buildChatSystemPrompt } from '@/app/api/ai/conversations/[id]/messages/system-prompt'
import { refundActiveBenefitReservation, reserveCreditsForActiveBenefit } from '@/lib/billing/credits'
import { resolveUploadEntitlements } from '@/lib/billing/entitlements'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import type { AuthContext } from '@/lib/get-auth-context'
import { apiKeyEnvForChatModel, chatLanguageModel } from './client'
import type { PendingActionDisplay } from './pending-actions'
import { createProposalTools, type DryRunProposal } from './proposal-tools'
import { AI_RESEARCH_LIMITS } from './research'
import { createResearchTools } from './research-tools'
import { SkillRunError, collectEvidence, finishSkillRun, reserveSkillRun, type SkillDefinition } from './skill-run'
import { AUTOMATION_WRITE_ACTIONS } from './automations'
import { hydrateInstructionReferences } from './instruction-references'

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
  const [instruction = ''] = await hydrateInstructionReferences(ctx, [row.instruction ?? ''])
  return {
    id: row.id,
    name: row.name,
    instruction,
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

  // 通常の /ai と同じく、AI を使えるのは石を積んでいるメンバーだけ（テスト実行で制限を回避させない）
  if (isBillingEnabled()) {
    const entitlements = await resolveUploadEntitlements(ctx.workspaceId, ctx.userId)
    if (!entitlements.isActiveSupporter) {
      throw new DryRunError(403, 'AIへの依頼は、石を積んでいるメンバーのみ利用できます。設定の請求から石を積んでください。')
    }
  }

  const triggerKey = `dry:${crypto.randomUUID()}`
  // テスト実行はワークスペースの既定モデルで行う。送る前にそのモデルの見積もりを押さえ、終わった後に原価で精算する
  const credits = chatRequestCredits(workspace.aiChatModel)
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
  const startedAt = Date.now()
  // 通常の /ai と同じく、ai_chat_usage に記録して原価で精算する（請求画面の自分の明細にも出る）。
  // charged が false（返金した失敗）の行は消費を記録しない
  const recordUsage = (input: { charged: boolean; steps: ChatUsageStep[] }) =>
    recordChatUsageAfterResponse(() => ({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      conversationId: null,
      assistantMessageId: crypto.randomUUID(),
      skillRunId: runId,
      model: workspace.aiChatModel,
      requestCredits: isBillingEnabled() ? credits : null,
      charged: input.charged,
      status: input.charged ? 'success' : 'failed',
      error: input.charged ? null : 'stream_failed',
      durationMs: Date.now() - startedAt,
      steps: input.steps,
    }))
  try {
    const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'full', timeStyle: 'short' })
    const result = await generateText({
      model: chatLanguageModel(workspace.aiChatModel),
      messages: buildChatModelMessages(
        buildChatSystemPrompt({
          now,
          role: ctx.role,
          contextSection: '',
          hasWebSearch: false,
          workspaceInstructions: workspace.aiChatSystemPrompt,
          skill,
        }),
        [{ role: 'user', content: `$${skill.name}${request.trim() ? ` ${request.trim()}` : ''}` }],
      ),
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
      // 応答の後に原価で精算する額（ai_chat_usage.credits_charged と同じ計算）
      creditsUsed: isBillingEnabled() ? chatUsageCharge(workspace.aiChatModel, result.steps).credits : null,
    })
    recordUsage({ charged: true, steps: result.steps })
    return output
  } catch (error) {
    console.error('[skill dry-run] failed', error)
    await refundActiveBenefitReservation(ctx.workspaceId, credits, triggerKey).catch(() => undefined)
    recordUsage({ charged: false, steps: [] })
    await finishSkillRun(runId, { status: 'failed', error: error instanceof Error ? error.message.slice(0, 500) : 'unknown' })
    throw new DryRunError(500, 'テスト実行に失敗しました。時間をおいてもう一度お試しください')
  }
}
