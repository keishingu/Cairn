// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import type { MessageDto } from '../route'

type RouteContext = { params: Promise<{ channelId: string }> }

export async function GET(req: Request, { params }: RouteContext) {
  const { channelId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json([] satisfies MessageDto[])

  try {
    const { db } = await import('@cairn/db')
    const { messages, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, isNull, and, ilike } = await import('drizzle-orm')
    const { desc } = await import('drizzle-orm')

    const rows = await db
      .select({
        id: messages.id,
        content: messages.content,
        senderId: messages.senderId,
        senderName: profiles.displayName,
        senderAvatarUrl: workspaceMembers.avatarUrl,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
      })
      .from(messages)
      .innerJoin(profiles, eq(messages.senderId, profiles.id))
      .leftJoin(
        workspaceMembers,
        and(eq(workspaceMembers.userId, messages.senderId), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
      )
      .where(and(
        eq(messages.channelId, channelId),
        isNull(messages.deletedAt),
        ilike(messages.content, `%${q}%`),
      ))
      .orderBy(desc(messages.createdAt))
      .limit(50)

    const result: MessageDto[] = rows.map(r => ({
      id: r.id,
      content: r.content,
      senderId: r.senderId,
      senderName: r.senderName,
      senderAvatarUrl: r.senderAvatarUrl ?? null,
      createdAt: r.createdAt.toISOString(),
      isEdited: r.updatedAt.getTime() > r.createdAt.getTime(),
      reactions: [],
      attachments: [],
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/channels/[channelId]/messages/search GET] DB query failed:', err)
    return NextResponse.json([] satisfies MessageDto[])
  }
}
