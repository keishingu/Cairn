// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { FEATURE_FLAGS } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'

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
    const { messageBookmarks, messages, channels, channelMembers, profiles, workspaceMembers, projects, projectMembers, milestones } = await import('@cairn/db')
    const { eq, isNull, and, or, exists, desc, sql } = await import('drizzle-orm')

    // プライベートチャンネル・DM は現在もメンバーである場合のみ表示する（アクセスを失った後のブックマーク内容漏洩を防ぐ）。
    // DM は isPrivate=false でも channel_members 参加者限定のチャンネルのため、type も判定に含める
    const memberSubquery = db
      .select({ one: sql<number>`1` })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, ctx.userId)))

    // ゲストは参加プロジェクトのチャンネルのみ閲覧可能（requireChannelAccess と同じ制約）。
    // プロジェクトから外れた後もブックマーク経由でメッセージが見えてしまうのを防ぐ
    const role = ctx.role
    const projectMemberSubquery = db
      .select({ one: sql<number>`1` })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, channels.projectId), eq(projectMembers.userId, ctx.userId)))
    const nonPrivateVisible = role === 'guest'
      ? and(eq(channels.isPrivate, false), sql`${channels.type} <> 'dm'`, or(
          sql`${channels.type} <> 'project'`,
          exists(projectMemberSubquery),
        ))
      : and(eq(channels.isPrivate, false), sql`${channels.type} <> 'dm'`)

    const rows = await db
      .select({
        id: messages.id,
        content: messages.content,
        senderName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
        senderAvatarUrl: workspaceMembers.avatarUrl,
        createdAt: messages.createdAt,
        channelId: channels.id,
        channelName: sql<string>`coalesce(${milestones.title}, ${projects.title}, ${channels.name}, 'DM')`,
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
      .leftJoin(milestones, eq(channels.milestoneId, milestones.id))
      .where(and(
        eq(messageBookmarks.userId, ctx.userId),
        eq(channels.workspaceId, ctx.workspaceId),
        FEATURE_FLAGS.dm ? undefined : sql`${channels.type} <> 'dm'`,
        isNull(messages.deletedAt),
        or(
          nonPrivateVisible,
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
