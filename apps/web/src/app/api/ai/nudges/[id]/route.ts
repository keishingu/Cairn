// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess, requireProjectAccess } from '@/lib/permissions'

const patchSchema = z.union([
  z.object({ feedback: z.enum(['later', 'not_helpful']) }),
  z.object({ action: z.literal('resolve_completed_task') }),
])

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const { aiNudges, db, tasks } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')
    const [nudge] = await db
      .select({
        id: aiNudges.id,
        channelId: aiNudges.channelId,
        projectId: aiNudges.projectId,
        taskId: aiNudges.taskId,
      })
      .from(aiNudges)
      .where(
        and(
          eq(aiNudges.id, id),
          eq(aiNudges.workspaceId, ctx.workspaceId),
          eq(aiNudges.userId, ctx.userId),
          eq(aiNudges.status, 'active'),
        ),
      )
      .limit(1)

    if (!nudge) return NextResponse.json({ error: 'ナッジが見つかりません' }, { status: 404 })

    if (nudge.channelId) {
      const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, nudge.channelId)
      if (forbidden) return forbidden
    } else if (nudge.projectId) {
      const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, nudge.projectId)
      if (forbidden) return forbidden
    }

    const now = new Date()
    if ('action' in parsed.data) {
      if (!nudge.taskId) {
        return NextResponse.json({ error: '対象タスクが見つかりません' }, { status: 409 })
      }
      const [task] = await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.id, nudge.taskId))
        .limit(1)
      if (task?.status !== 'done') {
        return NextResponse.json({ error: 'タスクが完了していません' }, { status: 409 })
      }

      const updated = await db
        .update(aiNudges)
        .set({ status: 'resolved', remindAfter: null, respondedAt: now })
        .where(
          and(eq(aiNudges.id, id), eq(aiNudges.userId, ctx.userId), eq(aiNudges.status, 'active')),
        )
        .returning({ id: aiNudges.id })
      if (updated.length === 0) {
        return NextResponse.json({ error: 'ナッジはすでに更新されています' }, { status: 409 })
      }
      return NextResponse.json({ id, status: 'resolved', remindAfter: null })
    }

    const cooldownDays = parsed.data.feedback === 'later' ? 2 : 30
    const remindAfter = new Date(now.getTime() + cooldownDays * 86_400_000)
    const status = parsed.data.feedback === 'later' ? ('dismissed' as const) : ('suppressed' as const)
    const updated = await db
      .update(aiNudges)
      .set({
        status,
        feedback: parsed.data.feedback,
        remindAfter,
        respondedAt: now,
      })
      .where(
        and(eq(aiNudges.id, id), eq(aiNudges.userId, ctx.userId), eq(aiNudges.status, 'active')),
      )
      .returning({ id: aiNudges.id })

    if (updated.length === 0) {
      return NextResponse.json({ error: 'ナッジはすでに更新されています' }, { status: 409 })
    }
    return NextResponse.json({ id, status, remindAfter: remindAfter.toISOString() })
  } catch (err) {
    console.error('[PATCH /api/ai/nudges/:id]', err)
    return NextResponse.json({ error: 'ナッジの更新に失敗しました' }, { status: 500 })
  }
}
