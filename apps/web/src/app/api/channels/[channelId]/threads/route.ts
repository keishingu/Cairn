// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess, requireRole } from '@/lib/permissions'
import { lockActiveMemberships } from '@/lib/access/active-membership-lock'

type RouteContext = { params: Promise<{ channelId: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = requireRole(ctx.role, 'member')
  if (forbidden) return forbidden

  const { channelId } = await params
  const accessDenied = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
  if (accessDenied) return accessDenied

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 })
  }

  const name = typeof rawBody === 'object' && rawBody !== null && typeof (rawBody as { name?: unknown }).name === 'string'
    ? (rawBody as { name: string }).name.trim()
    : ''

  if (!name) return NextResponse.json({ error: 'スレッド名を入力してください' }, { status: 400 })
  if (name.length > 60) return NextResponse.json({ error: '60文字以内で入力してください' }, { status: 400 })

  try {
    const { db, channels, channelMembers } = await import('@cairn/db')
    const { and, eq, sql } = await import('drizzle-orm')
    const parentChannelId = sql<string | null>`to_jsonb(${channels})->>'parent_channel_id'`

    const [parent] = await db
      .select({
        id: channels.id,
        workspaceId: channels.workspaceId,
        isPrivate: channels.isPrivate,
        parentChannelId,
        parentColumnReady: sql<boolean>`to_jsonb(${channels}) ? 'parent_channel_id'`,
      })
      .from(channels)
      .where(and(
        eq(channels.id, channelId),
        eq(channels.workspaceId, ctx.workspaceId),
        eq(channels.type, 'workspace'),
      ))
      .limit(1)

    if (!parent || parent.parentChannelId !== null) {
      return NextResponse.json({ error: '親チャンネルが見つかりません' }, { status: 404 })
    }
    if (!parent.parentColumnReady) {
      return NextResponse.json({ error: 'スレッド機能を準備中です。しばらくしてから再度お試しください' }, { status: 503 })
    }

    const threadId = await db.transaction(async tx => {
      // メンバー追加と子スレッド作成を同じ親行で直列化し、参加者の取りこぼしを防ぐ。
      await tx
        .select({ id: channels.id })
        .from(channels)
        .where(eq(channels.id, parent.id))
        .for('update')
        .limit(1)

      const members = await tx
        .select({ userId: channelMembers.userId })
        .from(channelMembers)
        .where(eq(channelMembers.channelId, parent.id))

      if (!(await lockActiveMemberships(
        tx,
        ctx.workspaceId,
        [ctx.userId, ...members.map(member => member.userId)],
      ))) return null

      const [thread] = await tx
        .insert(channels)
        .values({
          workspaceId: parent.workspaceId,
          parentChannelId: parent.id,
          type: 'workspace',
          name,
          isPrivate: parent.isPrivate,
        })
        .returning({ id: channels.id })

      if (!thread) throw new Error('thread insert returned no rows')

      if (members.length > 0) {
        await tx
          .insert(channelMembers)
          .values(members.map(member => ({ channelId: thread.id, userId: member.userId })))
          .onConflictDoNothing()
      }

      return thread.id
    })

    if (!threadId) {
      return NextResponse.json({ error: '参加者に退会済みユーザーが含まれています' }, { status: 422 })
    }

    return NextResponse.json({ id: threadId }, { status: 201 })
  } catch (err) {
    console.error('[/api/channels/[channelId]/threads POST] DB error:', err)
    return NextResponse.json({ error: 'スレッドの作成に失敗しました' }, { status: 500 })
  }
}
