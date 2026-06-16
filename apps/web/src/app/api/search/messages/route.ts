// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'

export interface MessageSearchResultDto extends MessageDto {
  channelId: string
  channelName: string
}

export async function GET(req: Request) {
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json([] satisfies MessageSearchResultDto[])

  try {
    const { db } = await import('@cairn/db')
    const { channels, channelMembers, messages, profiles, workspaceMembers, projects } = await import('@cairn/db')
    const { eq, ne, isNull, and, ilike, or, exists } = await import('drizzle-orm')
    const { desc, sql } = await import('drizzle-orm')

    const memberSubquery = db
      .select({ one: sql<number>`1` })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, ctx.userId)))

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
        channelId: channels.id,
        channelName: sql<string>`coalesce(${projects.title}, ${channels.name}, 'DM')`,
      })
      .from(messages)
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .innerJoin(profiles, eq(messages.senderId, profiles.id))
      .leftJoin(
        workspaceMembers,
        and(eq(workspaceMembers.userId, messages.senderId), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
      )
      .leftJoin(projects, eq(channels.projectId, projects.id))
      .where(and(
        eq(channels.workspaceId, ctx.workspaceId),
        isNull(messages.deletedAt),
        ne(messages.messageType, 'system'),
        ilike(messages.content, `%${q}%`),
        or(
          eq(channels.isPrivate, false),
          exists(memberSubquery),
        ),
      ))
      .orderBy(desc(messages.createdAt))
      .limit(50)

    const result: MessageSearchResultDto[] = rows.map(r => ({
      id: r.id,
      content: r.content,
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
      channelId: r.channelId,
      channelName: r.channelName,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/search/messages GET] DB query failed:', err)
    return NextResponse.json([] satisfies MessageSearchResultDto[])
  }
}
