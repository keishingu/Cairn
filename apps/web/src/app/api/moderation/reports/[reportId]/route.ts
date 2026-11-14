// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { isModerator } from '@/lib/safety/moderator'

const schema = z.object({ status: z.enum(['resolved', 'dismissed']), note: z.string().trim().max(2000).optional(), deleteMessage: z.boolean().optional() })
type RouteContext = { params: Promise<{ reportId: string }> }

export async function PATCH(req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  if (!(await isModerator(ctx.userId))) return NextResponse.json({ error: 'この操作には運営者権限が必要です' }, { status: 403 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  const { reportId } = await params
  const { db, contentReports, messages, tasks } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const now = new Date()
  const [report] = await db.select({ messageId: contentReports.messageId }).from(contentReports).where(eq(contentReports.id, reportId)).limit(1)
  if (!report) return NextResponse.json({ error: '通報が見つかりません' }, { status: 404 })
  await db.transaction(async tx => {
    if (parsed.data.deleteMessage) {
      await tx.update(messages).set({ deletedAt: now }).where(eq(messages.id, report.messageId))
      await tx.delete(tasks).where(eq(tasks.sourceMessageId, report.messageId))
    }
    await tx.update(contentReports).set({ status: parsed.data.status, resolutionNote: parsed.data.note ?? null, resolvedAt: now, resolvedBy: ctx.userId, ...(parsed.data.deleteMessage ? { messageDeletedAt: now } : {}) }).where(eq(contentReports.id, reportId))
  })
  return NextResponse.json({ updated: true })
}
