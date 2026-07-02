// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceMemberRole } from '@/lib/permissions'
import { extractMentionIds, hydrateMentions } from '@/lib/chat/mentions'
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
  if (q.length > 200) {
    return NextResponse.json({ error: '検索クエリは 200 文字以内で入力してください' }, { status: 400 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { channels, channelMembers, messages, profiles, workspaceMembers, projects, projectMembers } = await import('@cairn/db')
    const { eq, ne, isNull, and, ilike, or, exists, inArray } = await import('drizzle-orm')
    const { desc, sql } = await import('drizzle-orm')

    const memberSubquery = db
      .select({ one: sql<number>`1` })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, ctx.userId)))

    // ゲストは参加プロジェクトのチャンネルと、自分が所属するチャンネル（DM等）のみ検索可。
    // member 以上は公開チャンネル全体＋所属チャンネルを検索できる。ただし DM は is_private=false でも
    // 参加者を channel_members で管理するため、公開条件から除外しメンバーのみに限定する。
    const role = await getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)
    const guestProjectAccess = db
      .select({ one: sql<number>`1` })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, channels.projectId), eq(projectMembers.userId, ctx.userId)))
    const accessCondition = role === 'guest'
      ? or(exists(memberSubquery), exists(guestProjectAccess))
      : or(and(eq(channels.isPrivate, false), ne(channels.type, 'dm')), exists(memberSubquery))

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
        accessCondition,
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

    const result: MessageSearchResultDto[] = rows.map(r => ({
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
      channelId: r.channelId,
      channelName: r.channelName,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/search/messages GET] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
