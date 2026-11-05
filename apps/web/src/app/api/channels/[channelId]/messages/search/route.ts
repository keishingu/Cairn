// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { loadImportedSenders } from '@/lib/imports/display'
import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { hydrateMentions } from '@/lib/chat/mentions'
import { buildMentionNameMap } from '@/lib/chat/mention-name-map'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import type { MessageDto } from '../route'

type RouteContext = { params: Promise<{ channelId: string }> }

export async function GET(req: Request, { params }: RouteContext) {
  const { channelId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json([] satisfies MessageDto[])

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { messages, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, ne, isNull, and, ilike } = await import('drizzle-orm')
    const { desc } = await import('drizzle-orm')

    const rows = await db
      .select({
        id: messages.id,
        content: messages.content,
        messageType: messages.messageType,
        senderId: messages.senderId,
        senderName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
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
    const nameMap = await buildMentionNameMap(ctx.workspaceId, rows.map(r => r.content))
    // 取り込んだ過去ログは共通の取り込みプロフィールが送信者なので、本当の投稿者で表示を上書きする（docs/import-design.md）
    const importedSenders = await loadImportedSenders(ctx.workspaceId, rows.map(r => r.id))

    const result: MessageDto[] = rows.map(r => ({
      id: r.id,
      content: hydrateMentions(r.content, id => nameMap.get(id)),
      messageType: r.messageType,
      senderId: r.senderId,
      senderName: importedSenders.get(r.id)?.name ?? r.senderName,
      senderAvatarUrl: importedSenders.has(r.id) ? importedSenders.get(r.id)!.avatarUrl : r.senderAvatarUrl ?? null,
      ...(importedSenders.has(r.id) ? { imported: importedSenders.get(r.id)!.info } : {}),
      createdAt: r.createdAt.toISOString(),
      isEdited: r.updatedAt.getTime() > r.createdAt.getTime(),
      reactions: [],
      attachments: [],
      parentMessageId: null,
      replyTo: null,
      bookmarked: false,
      linkedTasks: [],
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/channels/[channelId]/messages/search GET] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
