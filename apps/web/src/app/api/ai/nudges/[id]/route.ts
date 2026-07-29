// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { FEATURE_FLAGS } from '@cairn/shared'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess, requireProjectAccess } from '@/lib/permissions'

const feedbackSchema = z.object({
  feedback: z.enum(['later', 'not_helpful']),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  if (!FEATURE_FLAGS.aiPmo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = feedbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const { aiNudges, db } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')
    const [nudge] = await db
      .select({
        id: aiNudges.id,
        channelId: aiNudges.channelId,
        projectId: aiNudges.projectId,
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
    return NextResponse.json({ error: 'フィードバックの保存に失敗しました' }, { status: 500 })
  }
}
