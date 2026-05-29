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

const MOCK_NOTIFICATIONS: NotificationDto[] = [
  {
    id: 'n1', type: 'mention',
    title: '佐藤 花子 があなたをメンションしました',
    body: '@山田 太郎 1日目のテント場について意見ある？',
    data: { senderName: '佐藤 花子' },
    readAt: null, createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'n2', type: 'file',
    title: '田中 陽子 がファイルを共有しました',
    body: '北アルプス縦走計画書_v2.pdf',
    data: { senderName: '田中 陽子' },
    readAt: null, createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
  },
  {
    id: 'n3', type: 'status',
    title: '鈴木 健 がステータスを変更しました',
    body: 'クライミング講習会 を 審議中 に変更',
    data: { senderName: '鈴木 健' },
    readAt: null, createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'n4', type: 'ai',
    title: 'AIアシスタントから通知',
    body: '装備リストの不足（予備ガス缶+2個）を検出しました',
    data: {},
    readAt: null, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'n5', type: 'task',
    title: '伊藤 翔 がタスクを完了しました',
    body: '「ルート案を作成する」',
    data: { senderName: '伊藤 翔' },
    readAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'n6', type: 'invite',
    title: '高橋 美咲 があなたをプロジェクトに招待しました',
    body: '雪山訓練',
    data: { senderName: '高橋 美咲' },
    readAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'n7', type: 'reaction',
    title: '中村 拓也 があなたのメッセージにリアクションしました',
    body: '👍',
    data: { senderName: '中村 拓也' },
    readAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
]

export async function GET(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('filter') ?? 'all'

  if (!process.env['DATABASE_URL']) {
    const filtered = MOCK_NOTIFICATIONS.filter(n => {
      if (filter === 'unread') return n.readAt === null
      if (filter === 'mention') return n.type === 'mention'
      if (filter === 'ai') return n.type === 'ai'
      return true
    })
    return NextResponse.json(filtered)
  }

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

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ updated: 0 })
  }

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
