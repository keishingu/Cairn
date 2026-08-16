// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'

const schema = z.object({
  reason: z.enum(['harassment', 'discriminatory', 'sexual', 'violence', 'spam', 'other']),
  details: z.string().trim().max(1000).optional(),
}).superRefine((value, ctx) => {
  if (value.reason === 'other' && !value.details) ctx.addIssue({ code: 'custom', message: '補足説明を入力してください' })
})

type RouteContext = { params: Promise<{ messageId: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const { messageId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { db, channels, contentReports, messages } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [message] = await db.select({ channelId: messages.channelId, senderId: messages.senderId, content: messages.content })
    .from(messages).innerJoin(channels, eq(channels.id, messages.channelId))
    .where(and(eq(messages.id, messageId), eq(channels.workspaceId, ctx.workspaceId))).limit(1)
  if (!message) return NextResponse.json({ error: '報告対象のメッセージが見つかりません' }, { status: 404 })
  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, message.channelId, ctx.role)
  if (forbidden) return forbidden
  if (message.senderId === ctx.userId) return NextResponse.json({ error: '自分のメッセージは報告できません' }, { status: 422 })

  const result = await db.insert(contentReports).values({
    workspaceId: ctx.workspaceId, channelId: message.channelId, messageId, reporterId: ctx.userId,
    reportedUserId: message.senderId, reason: parsed.data.reason, details: parsed.data.details ?? null,
    contentSnapshot: message.content,
  }).onConflictDoNothing().returning({ id: contentReports.id })
  return NextResponse.json({ reported: true, duplicate: result.length === 0 }, { status: result.length ? 201 : 200 })
}
