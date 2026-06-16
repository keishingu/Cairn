// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface BookmarkDto {
  id: string
  content: string
  senderName: string
  senderAvatarUrl: string | null
  createdAt: string
  channelId: string
  channelName: string
  bookmarkedAt: string
}

// ログインユーザーがブックマークしたメッセージ一覧（新しい順）
export async function GET(_req: Request) {
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  try {
    const { db } = await import('@cairn/db')
    const { messageBookmarks, messages, channels, channelMembers, profiles, workspaceMembers, projects } = await import('@cairn/db')
    const { eq, isNull, and, or, exists, desc, sql } = await import('drizzle-orm')

    // プライベートチャンネルは現在もメンバーである場合のみ表示する（アクセスを失った後のブックマーク内容漏洩を防ぐ）
    const memberSubquery = db
      .select({ one: sql<number>`1` })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, ctx.userId)))

    const rows = await db
      .select({
        id: messages.id,
        content: messages.content,
        senderName: profiles.displayName,
        senderAvatarUrl: workspaceMembers.avatarUrl,
        createdAt: messages.createdAt,
        channelId: channels.id,
        channelName: sql<string>`coalesce(${projects.title}, ${channels.name}, 'DM')`,
        bookmarkedAt: messageBookmarks.createdAt,
      })
      .from(messageBookmarks)
      .innerJoin(messages, eq(messageBookmarks.messageId, messages.id))
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .innerJoin(profiles, eq(messages.senderId, profiles.id))
      .leftJoin(
        workspaceMembers,
        and(eq(workspaceMembers.userId, messages.senderId), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
      )
      .leftJoin(projects, eq(channels.projectId, projects.id))
      .where(and(
        eq(messageBookmarks.userId, ctx.userId),
        eq(channels.workspaceId, ctx.workspaceId),
        isNull(messages.deletedAt),
        or(
          eq(channels.isPrivate, false),
          exists(memberSubquery),
        ),
      ))
      .orderBy(desc(messageBookmarks.createdAt))
      .limit(100)

    const result: BookmarkDto[] = rows.map(r => ({
      id: r.id,
      content: r.content,
      senderName: r.senderName,
      senderAvatarUrl: r.senderAvatarUrl ?? null,
      createdAt: r.createdAt.toISOString(),
      channelId: r.channelId,
      channelName: r.channelName,
      bookmarkedAt: r.bookmarkedAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/me/bookmarks GET] DB query failed:', err)
    return NextResponse.json([] satisfies BookmarkDto[])
  }
}
