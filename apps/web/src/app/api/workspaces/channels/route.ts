// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface WorkspaceChannelDto {
  id: string
  name: string | null
  isPrivate: boolean
  memberCount: number
  memberNames: string[]
}

function mockChannels(): WorkspaceChannelDto[] {
  return [
    { id: 'g1', name: '雑談',     isPrivate: false, memberCount: 8, memberNames: ['山田 太郎', '佐藤 花子', '鈴木 健', '田中 陽子'] },
    { id: 'g2', name: '連絡事項', isPrivate: false, memberCount: 5, memberNames: ['山田 太郎', '佐藤 花子', '鈴木 健'] },
  ]
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json(mockChannels())
  }

  try {
    const { db } = await import('@cairn/db')
    const { channels, channelMembers, profiles } = await import('@cairn/db')
    const { and, eq, inArray } = await import('drizzle-orm')

    const channelRows = await db
      .select({ id: channels.id, name: channels.name, isPrivate: channels.isPrivate })
      .from(channels)
      .where(and(eq(channels.workspaceId, ctx.workspaceId), eq(channels.type, 'workspace')))
      .orderBy(channels.createdAt)

    if (channelRows.length === 0) return NextResponse.json([] satisfies WorkspaceChannelDto[])

    const memberRows = await db
      .select({ channelId: channelMembers.channelId, displayName: profiles.displayName })
      .from(channelMembers)
      .innerJoin(profiles, eq(channelMembers.userId, profiles.id))
      .where(inArray(channelMembers.channelId, channelRows.map(c => c.id)))
      .orderBy(channelMembers.joinedAt)

    const membersByChannel = new Map<string, string[]>()
    for (const m of memberRows) {
      const arr = membersByChannel.get(m.channelId) ?? []
      arr.push(m.displayName)
      membersByChannel.set(m.channelId, arr)
    }

    const result: WorkspaceChannelDto[] = channelRows.map(c => {
      const names = membersByChannel.get(c.id) ?? []
      return { id: c.id, name: c.name, isPrivate: c.isPrivate, memberCount: names.length, memberNames: names.slice(0, 4) }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/workspaces/channels] DB query failed, using mock data:', err)
    return NextResponse.json(mockChannels())
  }
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 })
  }
  const body = typeof rawBody === 'object' && rawBody !== null && !Array.isArray(rawBody)
    ? rawBody as Record<string, unknown>
    : {}

  const name = typeof body['name'] === 'string' ? body['name'].trim() : ''
  const isPrivate = body['isPrivate'] === true

  if (!name) {
    return NextResponse.json({ error: 'チャンネル名を入力してください' }, { status: 400 })
  }
  if (name.length > 60) {
    return NextResponse.json({ error: '60文字以内で入力してください' }, { status: 400 })
  }

  if (!process.env['DATABASE_URL']) {
    const mock: WorkspaceChannelDto = {
      id: `mock-${Date.now()}`,
      name,
      isPrivate,
      memberCount: 0,
      memberNames: [],
    }
    return NextResponse.json(mock, { status: 201 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { channels } = await import('@cairn/db')

    const rows = await db
      .insert(channels)
      .values({
        workspaceId: ctx.workspaceId,
        type: 'workspace',
        name,
        isPrivate,
      })
      .returning({ id: channels.id, name: channels.name, isPrivate: channels.isPrivate })

    const inserted = rows[0]
    if (!inserted) throw new Error('insert returned no rows')
    const result: WorkspaceChannelDto = { ...inserted, memberCount: 0, memberNames: [] }
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[/api/workspaces/channels POST] DB error:', err)
    return NextResponse.json({ error: 'チャンネルの作成に失敗しました' }, { status: 500 })
  }
}
