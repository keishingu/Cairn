// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { FEATURE_FLAGS } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'

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
  const countOnly = searchParams.get('count') === '1'

  try {
    const { aiNudges, db, notifications, workspaces } = await import('@cairn/db')
    const { eq, ne, isNull, and, count, desc, sql } = await import('drizzle-orm')

    const conditions = [
      eq(notifications.userId, ctx.userId),
      eq(notifications.workspaceId, ctx.workspaceId),
    ]
    if (!FEATURE_FLAGS.dm) conditions.push(ne(notifications.type, 'dm'))
    if (!FEATURE_FLAGS.aiPmo) conditions.push(ne(notifications.type, 'ai'))
    if (filter === 'unread') conditions.push(isNull(notifications.readAt))
    if (filter === 'mention') conditions.push(eq(notifications.type, 'mention'))
    if (filter === 'ai') conditions.push(eq(notifications.type, 'ai'))
    // AI通知はナッジの現在の機能設定に従う。heartbeat が旧設定を読んで
    // 先に通知を作成しても、OFF 後はここで表示対象から外す。
    conditions.push(sql`(
      ${notifications.type} <> 'ai'
      or exists (
        select 1
        from ${aiNudges}
        inner join ${workspaces} on ${aiNudges.workspaceId} = ${workspaces.id}
        where ${aiNudges.id}::text = ${notifications.data}->>'nudgeId'
          and ${aiNudges.workspaceId} = ${notifications.workspaceId}
          and ${aiNudges.userId} = ${notifications.userId}
          and (
            (${aiNudges.detector} in ('task_due_soon', 'task_overdue', 'task_stalled')
              and ${workspaces.aiNudgesPhaseOneEnabled} = true)
            or (${aiNudges.detector} in ('unanswered_ask', 'llm_risk')
              and ${workspaces.aiNudgesPhaseTwoEnabled} = true)
          )
      )
    )`)

    if (countOnly) {
      const [row] = await db
        .select({ count: count() })
        .from(notifications)
        .where(and(...conditions))
      return NextResponse.json({ count: row?.count ?? 0 })
    }

    const rows = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(50)

    const result: NotificationDto[] = rows.map((r) => ({
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
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const rawIds = (body as { ids?: unknown }).ids
  if (
    rawIds !== undefined &&
    (!Array.isArray(rawIds) || rawIds.some((id) => typeof id !== 'string'))
  ) {
    return NextResponse.json({ error: 'ids は string[] で指定してください' }, { status: 400 })
  }
  const ids = rawIds as string[] | undefined

  try {
    const { db, notifications } = await import('@cairn/db')
    const { eq, ne, and, isNull, inArray } = await import('drizzle-orm')

    const now = new Date()
    // GET と同様に表示中のワークスペースへスコープする。「すべて既読」が他 WS の未読まで消さないように
    const base = and(
      eq(notifications.userId, ctx.userId),
      eq(notifications.workspaceId, ctx.workspaceId),
      isNull(notifications.readAt),
      FEATURE_FLAGS.dm ? undefined : ne(notifications.type, 'dm'),
      FEATURE_FLAGS.aiPmo ? undefined : ne(notifications.type, 'ai'),
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
