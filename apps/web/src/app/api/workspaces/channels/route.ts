// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface WorkspaceChannelDto {
  id: string
  name: string | null
  isPrivate: boolean
}

function mockChannels(): WorkspaceChannelDto[] {
  return [
    { id: 'g1', name: '雑談',     isPrivate: false },
    { id: 'g2', name: '連絡事項', isPrivate: false },
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
    const { channels } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    const rows = await db
      .select({ id: channels.id, name: channels.name, isPrivate: channels.isPrivate })
      .from(channels)
      .where(and(eq(channels.workspaceId, ctx.workspaceId), eq(channels.type, 'workspace')))
      .orderBy(channels.createdAt)

    return NextResponse.json(rows satisfies WorkspaceChannelDto[])
  } catch (err) {
    console.error('[/api/workspaces/channels] DB query failed, using mock data:', err)
    return NextResponse.json(mockChannels())
  }
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const body = await req.json() as { name?: unknown; isPrivate?: unknown }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const isPrivate = body.isPrivate === true

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
    return NextResponse.json(inserted satisfies WorkspaceChannelDto, { status: 201 })
  } catch (err) {
    console.error('[/api/workspaces/channels POST] DB error:', err)
    return NextResponse.json({ error: 'チャンネルの作成に失敗しました' }, { status: 500 })
  }
}
