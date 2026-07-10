// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getGuestVisibleProjectIds, getWorkspaceRole } from '@/lib/permissions'

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

    let visibleRows = rows

    // guest は再招待でスコープが絞られても古い通知が参照するチャンネル・プロジェクトを見られてしまうため、
    // 現在の参加プロジェクトに紐づかない通知を除外する（requireChannelAccess と同じスコープ感）
    const role = await getWorkspaceRole(ctx.workspaceId, ctx.userId)
    if (role === 'guest') {
      const guestProjectIds = new Set(await getGuestVisibleProjectIds(ctx.workspaceId, ctx.userId))

      const channelIds = [...new Set(
        rows.map(r => (r.data as Record<string, string> | null)?.['channelId']).filter((id): id is string => !!id),
      )]
      const channelProjectMap = new Map<string, string | null>()
      if (channelIds.length > 0) {
        const { channels } = await import('@cairn/db')
        const { inArray } = await import('drizzle-orm')
        const channelRows = await db
          .select({ id: channels.id, projectId: channels.projectId })
          .from(channels)
          .where(inArray(channels.id, channelIds))
        for (const c of channelRows) channelProjectMap.set(c.id, c.projectId)
      }

      visibleRows = rows.filter(r => {
        const data = r.data as Record<string, string> | null
        const channelId = data?.['channelId']
        const projectId = data?.['projectId']
        if (channelId) {
          const scopedProjectId = channelProjectMap.get(channelId)
          return scopedProjectId ? guestProjectIds.has(scopedProjectId) : true
        }
        if (projectId) return guestProjectIds.has(projectId)
        return true
      })
    }

    const result: NotificationDto[] = visibleRows.map(r => ({
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
  if (rawIds !== undefined && (!Array.isArray(rawIds) || rawIds.some(id => typeof id !== 'string'))) {
    return NextResponse.json({ error: 'ids は string[] で指定してください' }, { status: 400 })
  }
  const ids = rawIds as string[] | undefined

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
