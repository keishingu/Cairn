// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { FEATURE_FLAGS, patchWorkspaceSettingsSchema } from '@cairn/shared'
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
  // 利用量はワークスペース owner にだけ公開する。
  aiNudgesPhaseTwoUsage?: AiNudgesPhaseTwoUsageDto
}

function toSettingsDto(
  workspace: {
    settings: WorkspaceSettings | null
    aiNudgesPhaseOneEnabled: boolean
    aiNudgesPhaseTwoEnabled: boolean
    aiNudgesPhaseTwoInputTokens: number
    aiNudgesPhaseTwoOutputTokens: number
    aiNudgesPhaseTwoTotalTokens: number
    aiNudgesPhaseTwoRequestCount: number
  } | undefined,
  includeUsage: boolean,
): WorkspaceSettingsDto {
  return {
    ...(workspace?.settings ?? {}),
    aiNudgesPhaseOneEnabled: workspace?.aiNudgesPhaseOneEnabled ?? true,
    aiNudgesPhaseTwoEnabled: workspace?.aiNudgesPhaseTwoEnabled ?? false,
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
        aiNudgesPhaseTwoInputTokens: workspaces.aiNudgesPhaseTwoInputTokens,
        aiNudgesPhaseTwoOutputTokens: workspaces.aiNudgesPhaseTwoOutputTokens,
        aiNudgesPhaseTwoTotalTokens: workspaces.aiNudgesPhaseTwoTotalTokens,
        aiNudgesPhaseTwoRequestCount: workspaces.aiNudgesPhaseTwoRequestCount,
      })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspaceId))
      .limit(1)

    const { aiNudgesPhaseOneEnabled, aiNudgesPhaseTwoEnabled, ...settingsPatch } = patch
    const merged: WorkspaceSettings = { ...(ws?.settings ?? {}) }
    if (settingsPatch.projectLabel !== undefined) merged.projectLabel = settingsPatch.projectLabel

    const [updated] = await db
      .update(workspaces)
      .set({
        settings: merged,
        ...(aiNudgesPhaseOneEnabled === undefined ? {} : { aiNudgesPhaseOneEnabled }),
        ...(aiNudgesPhaseTwoEnabled === undefined ? {} : { aiNudgesPhaseTwoEnabled }),
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, ctx.workspaceId))
      .returning({
        settings: workspaces.settings,
        aiNudgesPhaseOneEnabled: workspaces.aiNudgesPhaseOneEnabled,
        aiNudgesPhaseTwoEnabled: workspaces.aiNudgesPhaseTwoEnabled,
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
