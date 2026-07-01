// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { extractMentionIds, hydrateMentions } from '@/lib/chat/mentions'
import type { MessageDto } from '../route'

type RouteContext = { params: Promise<{ channelId: string }> }

export async function GET(req: Request, { params }: RouteContext) {
  const { channelId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json([] satisfies MessageDto[])

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId)
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { messages, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, ne, isNull, and, ilike, inArray } = await import('drizzle-orm')
    const { desc } = await import('drizzle-orm')

    const rows = await db
      .select({
        id: messages.id,
        content: messages.content,
        messageType: messages.messageType,
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
        ne(messages.messageType, 'system'),
        ilike(messages.content, `%${q}%`),
      ))
      .orderBy(desc(messages.createdAt))
      .limit(50)

    // メンションを現在の表示名へ解決（保存値は名前なしの canonical 形式のため）
    const mentionIds = [...new Set(rows.flatMap(r => extractMentionIds(r.content)))]
    const nameMap = new Map<string, string>()
    if (mentionIds.length > 0) {
      const profileRows = await db
        .select({ id: profiles.id, displayName: profiles.displayName })
        .from(profiles)
        .where(inArray(profiles.id, mentionIds))
      for (const p of profileRows) nameMap.set(p.id, p.displayName)
    }

    const result: MessageDto[] = rows.map(r => ({
      id: r.id,
      content: hydrateMentions(r.content, id => nameMap.get(id)),
      messageType: r.messageType,
      senderId: r.senderId,
      senderName: r.senderName,
      senderAvatarUrl: r.senderAvatarUrl ?? null,
      createdAt: r.createdAt.toISOString(),
      isEdited: r.updatedAt.getTime() > r.createdAt.getTime(),
      reactions: [],
      attachments: [],
      parentMessageId: null,
      replyTo: null,
      bookmarked: false,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/channels/[channelId]/messages/search GET] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
