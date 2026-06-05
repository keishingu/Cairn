// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface NotificationDto {
  id: string
  type: 'mention' | 'task' | 'file' | 'status' | 'invite' | 'reaction' | 'ai'
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

    const conditions = [eq(notifications.userId, ctx.userId)]
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

  let body: unknown
  try { body = await req.json() } catch { body = {} }
  const ids = (body as { ids?: string[] }).ids

  try {
    const { db, notifications } = await import('@cairn/db')
    const { eq, and, isNull, inArray } = await import('drizzle-orm')

    const now = new Date()
    const where = ids?.length
      ? and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt), inArray(notifications.id, ids))
      : and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt))

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
