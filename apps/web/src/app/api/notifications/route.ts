// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'

const patchNotificationsSchema = z.object({
  ids: z.array(z.string().uuid()).max(200).optional(),
})

export interface NotificationDto {
  id: string
  type: 'mention' | 'dm' | 'task' | 'file' | 'status' | 'invite' | 'reaction' | 'ai'
  title: string
  body: string
  data: Record<string, string> | null
  readAt: string | null
  createdAt: string
}

export async function GET(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('filter') ?? 'all'

  try {
    const { db, notifications } = await import('@cairn/db')
    const { eq, isNull, and, desc } = await import('drizzle-orm')

    const conditions = [
      eq(notifications.userId, ctx.userId),
      eq(notifications.workspaceId, ctx.workspaceId),
    ]
    if (filter === 'unread') conditions.push(isNull(notifications.readAt))
    if (filter === 'mention') conditions.push(eq(notifications.type, 'mention'))
    if (filter === 'ai') conditions.push(eq(notifications.type, 'ai'))

    const rows = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(50)

    const result: NotificationDto[] = rows.map(r => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      data: r.data as Record<string, string> | null,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/notifications]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = patchNotificationsSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const { ids } = parsed.data

  try {
    const { db, notifications } = await import('@cairn/db')
    const { eq, and, isNull, inArray } = await import('drizzle-orm')

    const now = new Date()
    // GET と同様に表示中のワークスペースへスコープする。「すべて既読」が他 WS の未読まで消さないように
    const base = and(
      eq(notifications.userId, ctx.userId),
      eq(notifications.workspaceId, ctx.workspaceId),
      isNull(notifications.readAt),
    )
    const where = ids?.length ? and(base, inArray(notifications.id, ids)) : base

    const updated = await db
      .update(notifications)
      .set({ readAt: now })
      .where(where)
      .returning({ id: notifications.id })

    return NextResponse.json({ updated: updated.length })
  } catch (err) {
    console.error('[PATCH /api/notifications]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
