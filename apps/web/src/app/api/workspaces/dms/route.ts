// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'

export interface DmChannelDto {
  id: string
  participantId: string
  participantName: string
}

const createDmSchema = z.object({ targetUserId: z.string().uuid() })

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json([] satisfies DmChannelDto[])
  }

  try {
    const { db } = await import('@cairn/db')
    const { channels, channelMembers, profiles } = await import('@cairn/db')
    const { and, eq, inArray, ne } = await import('drizzle-orm')

    // 自分が参加している DM チャンネル ID を取得
    const myChannelIds = db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(eq(channelMembers.userId, ctx.userId))

    // 相手メンバーの情報を取得
    const rows = await db
      .select({
        id: channels.id,
        participantId: profiles.id,
        participantName: profiles.displayName,
      })
      .from(channels)
      .innerJoin(channelMembers, eq(channelMembers.channelId, channels.id))
      .innerJoin(profiles, eq(profiles.id, channelMembers.userId))
      .where(
        and(
          eq(channels.workspaceId, ctx.workspaceId),
          eq(channels.type, 'dm'),
          ne(channelMembers.userId, ctx.userId),
          inArray(channels.id, myChannelIds),
        ),
      )
      .orderBy(profiles.displayName)

    return NextResponse.json(rows satisfies DmChannelDto[])
  } catch (err) {
    console.error('[/api/workspaces/dms GET] failed:', err)
    return NextResponse.json([] satisfies DmChannelDto[])
  }
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = createDmSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const { targetUserId } = parsed.data

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ id: `mock-dm-${targetUserId}` })
  }

  try {
    const { db } = await import('@cairn/db')
    const { channels, channelMembers } = await import('@cairn/db')
    const { and, eq, inArray, sql } = await import('drizzle-orm')

    // 既存の DM チャンネルを探す（両者が参加している）
    const myChannelIds = db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(eq(channelMembers.userId, ctx.userId))

    const targetChannelIds = db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(eq(channelMembers.userId, targetUserId))

    const existing = await db
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.workspaceId, ctx.workspaceId),
          eq(channels.type, 'dm'),
          inArray(channels.id, myChannelIds),
          inArray(channels.id, targetChannelIds),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      return NextResponse.json({ id: existing[0]!.id })
    }

    const [ch] = await db
      .insert(channels)
      .values({ workspaceId: ctx.workspaceId, type: 'dm' })
      .returning({ id: channels.id })

    if (!ch) throw new Error('channel insert failed')

    await db.insert(channelMembers).values([
      { channelId: ch.id, userId: ctx.userId },
      { channelId: ch.id, userId: targetUserId },
    ])

    void sql // suppress unused import warning

    return NextResponse.json({ id: ch.id }, { status: 201 })
  } catch (err) {
    console.error('[/api/workspaces/dms POST] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
