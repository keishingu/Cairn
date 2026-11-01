// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import {
  AI_CHAT_MODELS,
  DEFAULT_AI_CHAT_MODEL,
  FEATURE_FLAGS,
  isAiChatModel,
  patchWorkspaceSettingsSchema,
  type AiChatModel,
} from '@cairn/shared'
import { BILLING_CONFIG } from '@cairn/core/billing'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import type { AiNudgeDetector, WorkspaceSettings } from '@cairn/db'

export interface AiNudgesPhaseTwoUsageDto {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requestCount: number
}

export type WorkspaceSettingsDto = WorkspaceSettings & {
  aiNudgesPhaseOneEnabled: boolean
  aiNudgesPhaseTwoEnabled: boolean
  // 新しい会話の既定モデル
  aiChatModel: AiChatModel
  // メンバーが会話ごとに選べるモデル（既定モデルを必ず含む）。/ai のモデル切り替えにも使うため全ロールに返す
  aiChatAllowedModels: AiChatModel[]
  // /ai の1依頼で消費するクレジット（モデルごと）。課金が無効なら null（画面に消費量を出さない）
  aiChatRequestCredits: Record<AiChatModel, number> | null
  // AI チャットへ毎回渡す追加指示。null は未設定。owner 以外にも読み取り専用で表示する。
  aiChatSystemPrompt: string | null
  // 利用量はワークスペース owner にだけ公開する。
  aiNudgesPhaseTwoUsage?: AiNudgesPhaseTwoUsageDto
}

function toSettingsDto(
  workspace: {
    settings: WorkspaceSettings | null
    aiNudgesPhaseOneEnabled: boolean
    aiNudgesPhaseTwoEnabled: boolean
    aiChatModel: string
    aiChatAllowedModels: string[]
    aiChatSystemPrompt: string | null
    aiNudgesPhaseTwoInputTokens: number
    aiNudgesPhaseTwoOutputTokens: number
    aiNudgesPhaseTwoTotalTokens: number
    aiNudgesPhaseTwoRequestCount: number
  } | undefined,
  includeUsage: boolean,
): WorkspaceSettingsDto {
  // DB の CHECK 制約で保証される値。壊れていても既定へ黙って置き換えず、500 として表面化させる。
  if (workspace && !isAiChatModel(workspace.aiChatModel)) {
    throw new Error(`Invalid workspaces.ai_chat_model: ${workspace.aiChatModel}`)
  }
  if (workspace && !workspace.aiChatAllowedModels.every(isAiChatModel)) {
    throw new Error(`Invalid workspaces.ai_chat_allowed_models: ${workspace.aiChatAllowedModels.join(',')}`)
  }
  return {
    ...(workspace?.settings ?? {}),
    aiNudgesPhaseOneEnabled: workspace?.aiNudgesPhaseOneEnabled ?? true,
    aiNudgesPhaseTwoEnabled: workspace?.aiNudgesPhaseTwoEnabled ?? false,
    aiChatModel: workspace && isAiChatModel(workspace.aiChatModel) ? workspace.aiChatModel : DEFAULT_AI_CHAT_MODEL,
    aiChatAllowedModels: workspace ? workspace.aiChatAllowedModels.filter(isAiChatModel) : [...AI_CHAT_MODELS],
    aiChatRequestCredits: isBillingEnabled() ? { ...BILLING_CONFIG.aiChatRequestCreditsByModel } : null,
    aiChatSystemPrompt: workspace?.aiChatSystemPrompt ?? null,
    ...(includeUsage && workspace ? {
      aiNudgesPhaseTwoUsage: {
        inputTokens: workspace.aiNudgesPhaseTwoInputTokens,
        outputTokens: workspace.aiNudgesPhaseTwoOutputTokens,
        totalTokens: workspace.aiNudgesPhaseTwoTotalTokens,
        requestCount: workspace.aiNudgesPhaseTwoRequestCount,
      },
    } : {}),
  }
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db } = await import('@cairn/db')
    const { workspaces } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const [ws] = await db
      .select({
        settings: workspaces.settings,
        aiNudgesPhaseOneEnabled: workspaces.aiNudgesPhaseOneEnabled,
        aiNudgesPhaseTwoEnabled: workspaces.aiNudgesPhaseTwoEnabled,
        aiChatModel: workspaces.aiChatModel,
        aiChatAllowedModels: workspaces.aiChatAllowedModels,
        aiChatSystemPrompt: workspaces.aiChatSystemPrompt,
        aiNudgesPhaseTwoInputTokens: workspaces.aiNudgesPhaseTwoInputTokens,
        aiNudgesPhaseTwoOutputTokens: workspaces.aiNudgesPhaseTwoOutputTokens,
        aiNudgesPhaseTwoTotalTokens: workspaces.aiNudgesPhaseTwoTotalTokens,
        aiNudgesPhaseTwoRequestCount: workspaces.aiNudgesPhaseTwoRequestCount,
      })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspaceId))
      .limit(1)

    return NextResponse.json(toSettingsDto(ws, ctx.role === 'owner'))
  } catch (err) {
    console.error('[/api/workspaces/settings] GET failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = requireRole(ctx.role, 'owner')
  if (forbidden) return forbidden

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = patchWorkspaceSettingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const patch = parsed.data
  if (!FEATURE_FLAGS.aiPmo && (
    patch.aiNudgesPhaseOneEnabled !== undefined || patch.aiNudgesPhaseTwoEnabled !== undefined
  )) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { aiNudges, workspaces } = await import('@cairn/db')
    const { and, eq, inArray } = await import('drizzle-orm')

    // 既存の settings を取得してシャローマージ
    const [ws] = await db
      .select({
        settings: workspaces.settings,
        aiNudgesPhaseOneEnabled: workspaces.aiNudgesPhaseOneEnabled,
        aiNudgesPhaseTwoEnabled: workspaces.aiNudgesPhaseTwoEnabled,
        aiChatModel: workspaces.aiChatModel,
        aiChatAllowedModels: workspaces.aiChatAllowedModels,
        aiChatSystemPrompt: workspaces.aiChatSystemPrompt,
        aiNudgesPhaseTwoInputTokens: workspaces.aiNudgesPhaseTwoInputTokens,
        aiNudgesPhaseTwoOutputTokens: workspaces.aiNudgesPhaseTwoOutputTokens,
        aiNudgesPhaseTwoTotalTokens: workspaces.aiNudgesPhaseTwoTotalTokens,
        aiNudgesPhaseTwoRequestCount: workspaces.aiNudgesPhaseTwoRequestCount,
      })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspaceId))
      .limit(1)

    const {
      aiNudgesPhaseOneEnabled,
      aiNudgesPhaseTwoEnabled,
      aiChatModel,
      aiChatAllowedModels,
      aiChatSystemPrompt,
      ...settingsPatch
    } = patch
    // 既定モデルは選べるモデルに含める（CHECK 制約もあるが、500 ではなく理由を返す）
    const nextDefault = aiChatModel ?? ws?.aiChatModel
    const nextAllowed = aiChatAllowedModels ?? ws?.aiChatAllowedModels
    if (nextDefault && nextAllowed && !nextAllowed.includes(nextDefault)) {
      return NextResponse.json(
        { error: '新しい会話の既定モデルは、メンバーが選べるモデルに含めてください' },
        { status: 422 },
      )
    }
    const merged: WorkspaceSettings = { ...(ws?.settings ?? {}) }
    if (settingsPatch.projectLabel !== undefined) merged.projectLabel = settingsPatch.projectLabel

    const [updated] = await db
      .update(workspaces)
      .set({
        settings: merged,
        ...(aiNudgesPhaseOneEnabled === undefined ? {} : { aiNudgesPhaseOneEnabled }),
        ...(aiNudgesPhaseTwoEnabled === undefined ? {} : { aiNudgesPhaseTwoEnabled }),
        ...(aiChatModel === undefined ? {} : { aiChatModel }),
        ...(aiChatAllowedModels === undefined ? {} : { aiChatAllowedModels }),
        ...(aiChatSystemPrompt === undefined ? {} : { aiChatSystemPrompt }),
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, ctx.workspaceId))
      .returning({
        settings: workspaces.settings,
        aiNudgesPhaseOneEnabled: workspaces.aiNudgesPhaseOneEnabled,
        aiNudgesPhaseTwoEnabled: workspaces.aiNudgesPhaseTwoEnabled,
        aiChatModel: workspaces.aiChatModel,
        aiChatAllowedModels: workspaces.aiChatAllowedModels,
        aiChatSystemPrompt: workspaces.aiChatSystemPrompt,
        aiNudgesPhaseTwoInputTokens: workspaces.aiNudgesPhaseTwoInputTokens,
        aiNudgesPhaseTwoOutputTokens: workspaces.aiNudgesPhaseTwoOutputTokens,
        aiNudgesPhaseTwoTotalTokens: workspaces.aiNudgesPhaseTwoTotalTokens,
        aiNudgesPhaseTwoRequestCount: workspaces.aiNudgesPhaseTwoRequestCount,
      })

    // OFF にした Phase の既存カードも非表示にする。suppressed のまま保持するため、
    // 再度 ON にした後は条件が続くものだけ heartbeat で再評価・再表示できる。
    const disabledDetectors: AiNudgeDetector[] = [
      ...(aiNudgesPhaseOneEnabled === false
        ? ['task_due_soon', 'task_overdue', 'task_stalled'] satisfies AiNudgeDetector[]
        : []),
      ...(aiNudgesPhaseTwoEnabled === false
        ? ['unanswered_ask', 'llm_risk'] satisfies AiNudgeDetector[]
        : []),
    ]
    if (disabledDetectors.length > 0) {
      await db
        .update(aiNudges)
        .set({ status: 'suppressed', remindAfter: null })
        .where(and(
          eq(aiNudges.workspaceId, ctx.workspaceId),
          inArray(aiNudges.detector, disabledDetectors),
          eq(aiNudges.status, 'active'),
        ))
    }

    return NextResponse.json(toSettingsDto(updated, true))
  } catch (err) {
    console.error('[/api/workspaces/settings] PATCH failed:', err)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
