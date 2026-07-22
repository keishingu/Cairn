// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { AiNudgeDetector } from '@cairn/db'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'

export interface AiNudgeDto {
  id: string
  channelId: string | null
  projectId: string | null
  taskId: string | null
  messageId: string | null
  detector: AiNudgeDetector
  title: string
  body: string
  createdAt: string
}

export async function GET(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const channelId = new URL(req.url).searchParams.get('channelId')
  if (!channelId) {
    return NextResponse.json({ error: 'channelId は必須です' }, { status: 400 })
  }

  // API 層でも現在の active membership / guest project / private channel 権限を再評価する。
  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId)
  if (forbidden) return forbidden

  try {
    const { aiNudges, db, profiles, workspaces } = await import('@cairn/db')
    const { and, asc, eq, inArray, or } = await import('drizzle-orm')
    const rows = await db
      .select({
        id: aiNudges.id,
        channelId: aiNudges.channelId,
        projectId: aiNudges.projectId,
        taskId: aiNudges.taskId,
        messageId: aiNudges.messageId,
        detector: aiNudges.detector,
        title: aiNudges.title,
        body: aiNudges.body,
        createdAt: aiNudges.createdAt,
      })
      .from(aiNudges)
      .innerJoin(profiles, eq(aiNudges.userId, profiles.id))
      // owner がOFFへ切り替える操作とheartbeatが競合しても、読み取り時の再評価で
      // 無効化済みPhaseのカードをクライアントへ返さない。
      .innerJoin(workspaces, eq(aiNudges.workspaceId, workspaces.id))
      .where(
        and(
          eq(aiNudges.workspaceId, ctx.workspaceId),
          eq(aiNudges.userId, ctx.userId),
          eq(aiNudges.channelId, channelId),
          eq(aiNudges.status, 'active'),
          eq(profiles.aiNudgesEnabled, true),
          or(
            and(
              inArray(aiNudges.detector, ['task_due_soon', 'task_overdue', 'task_stalled']),
              eq(workspaces.aiNudgesPhaseOneEnabled, true),
            ),
            and(
              inArray(aiNudges.detector, ['unanswered_ask', 'llm_risk']),
              eq(workspaces.aiNudgesPhaseTwoEnabled, true),
            ),
          ),
        ),
      )
      .orderBy(asc(aiNudges.createdAt))

    const result: AiNudgeDto[] = rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }))
    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/ai/nudges]', err)
    return NextResponse.json({ error: 'ナッジの取得に失敗しました' }, { status: 500 })
  }
}
