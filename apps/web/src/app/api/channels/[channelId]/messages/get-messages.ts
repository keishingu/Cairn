// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { MessageType } from '@cairn/shared'
import { extractMentionIds, hydrateMentions } from '@/lib/chat/mentions'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import type { MessageDto, ReactionDto, ReplyToDto } from './dto'

type GetMessagesInput = {
  channelId: string
  requestUrl: string
  userId: string
  workspaceId: string
}

const PAGE_SIZE = 100

export async function getMessages({
  channelId,
  requestUrl,
  userId,
  workspaceId,
}: GetMessagesInput) {
  // ブックマーク・パーマリンクから開いた古いメッセージが直近100件の外にある場合、
  // その前後を中心としたウィンドウを取得する（無いと該当メッセージが読み込まれず、
  // ジャンプ先がスクロール表示されないまま静かに失敗する）
  const searchParams = new URL(requestUrl).searchParams
  const aroundMessageId = searchParams.get('around')
  // 最古の表示済みメッセージIDをカーソルとして、さらに古いページを取得する。
  const beforeMessageId = aroundMessageId ? null : searchParams.get('before')

  try {
    const { db } = await import('@cairn/db')
    const {
      messages,
      profiles,
      messageReactions,
      messageAttachments,
      messageBookmarks,
      files,
      workspaceMembers,
    } = await import('@cairn/db')
    const { eq, isNull, inArray, and, lte, lt, gt, or, desc, asc } = await import('drizzle-orm')

    const selectFields = {
      id: messages.id,
      content: messages.content,
      messageType: messages.messageType,
      parentMessageId: messages.parentMessageId,
      senderId: messages.senderId,
      senderName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
      senderAvatarUrl: workspaceMembers.avatarUrl,
      createdAt: messages.createdAt,
      updatedAt: messages.updatedAt,
    }

    let rows: Array<{
      id: string
      content: string
      messageType: MessageType
      parentMessageId: string | null
      senderId: string
      senderName: string
      senderAvatarUrl: string | null
      createdAt: Date
      updatedAt: Date
    }>

    let hasMore = false

    if (aroundMessageId) {
      const [anchor] = await db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(
          and(
            eq(messages.id, aroundMessageId),
            eq(messages.channelId, channelId),
            isNull(messages.deletedAt),
          ),
        )
        .limit(1)

      if (!anchor) {
        return NextResponse.json([] satisfies MessageDto[])
      }

      const [beforeAndAnchor, after] = await Promise.all([
        db
          .select(selectFields)
          .from(messages)
          .innerJoin(profiles, eq(messages.senderId, profiles.id))
          .leftJoin(
            workspaceMembers,
            and(
              eq(workspaceMembers.userId, messages.senderId),
              eq(workspaceMembers.workspaceId, workspaceId),
            ),
          )
          .where(
            and(
              eq(messages.channelId, channelId),
              isNull(messages.deletedAt),
              lte(messages.createdAt, anchor.createdAt),
            ),
          )
          .orderBy(desc(messages.createdAt))
          .limit(50),
        db
          .select(selectFields)
          .from(messages)
          .innerJoin(profiles, eq(messages.senderId, profiles.id))
          .leftJoin(
            workspaceMembers,
            and(
              eq(workspaceMembers.userId, messages.senderId),
              eq(workspaceMembers.workspaceId, workspaceId),
            ),
          )
          .where(
            and(
              eq(messages.channelId, channelId),
              isNull(messages.deletedAt),
              gt(messages.createdAt, anchor.createdAt),
            ),
          )
          .orderBy(asc(messages.createdAt))
          .limit(50),
      ])

      beforeAndAnchor.reverse()
      rows = [...beforeAndAnchor, ...after]
    } else {
      let cursor: { id: string; createdAt: Date } | null = null
      if (beforeMessageId) {
        const [found] = await db
          .select({ id: messages.id, createdAt: messages.createdAt })
          .from(messages)
          .where(and(
            eq(messages.id, beforeMessageId),
            eq(messages.channelId, channelId),
            isNull(messages.deletedAt),
          ))
          .limit(1)
        if (!found) return NextResponse.json([] satisfies MessageDto[], { headers: { 'X-Cairn-Has-More': 'false' } })
        cursor = found
      }

      const pageRows = await db
        .select(selectFields)
        .from(messages)
        .innerJoin(profiles, eq(messages.senderId, profiles.id))
        .leftJoin(
          workspaceMembers,
          and(
            eq(workspaceMembers.userId, messages.senderId),
            eq(workspaceMembers.workspaceId, workspaceId),
          ),
        )
        .where(and(
          eq(messages.channelId, channelId),
          isNull(messages.deletedAt),
          ...(cursor
            ? [or(
                lt(messages.createdAt, cursor.createdAt),
                and(eq(messages.createdAt, cursor.createdAt), lt(messages.id, cursor.id)),
              )]
            : []),
        ))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(PAGE_SIZE + 1)

      hasMore = pageRows.length > PAGE_SIZE
      rows = pageRows.slice(0, PAGE_SIZE)
      rows.reverse()
    }

    const messageIds = rows.map((r) => r.id)
    // 引用返信の参照先（表示中の100件の外にある可能性があるので別クエリで取得）
    const parentIds = [
      ...new Set(rows.map((r) => r.parentMessageId).filter((id): id is string => !!id)),
    ]

    const [reactionRows, attachmentRows, bookmarkRows, parentRows] = await Promise.all([
      messageIds.length > 0
        ? db
            .select({
              messageId: messageReactions.messageId,
              emoji: messageReactions.emoji,
              userId: messageReactions.userId,
              userName: workspaceMemberDisplayName(
                workspaceMembers.displayName,
                profiles.displayName,
              ),
            })
            .from(messageReactions)
            .innerJoin(profiles, eq(messageReactions.userId, profiles.id))
            .leftJoin(
              workspaceMembers,
              and(
                eq(workspaceMembers.userId, messageReactions.userId),
                eq(workspaceMembers.workspaceId, workspaceId),
              ),
            )
            .where(inArray(messageReactions.messageId, messageIds))
        : Promise.resolve([]),
      messageIds.length > 0
        ? db
            .select({
              id: messageAttachments.id,
              messageId: messageAttachments.messageId,
              fileId: messageAttachments.fileId,
              displayOrder: messageAttachments.displayOrder,
              fileName: files.fileName,
              mimeType: files.mimeType,
              fileSize: files.fileSize,
            })
            .from(messageAttachments)
            .innerJoin(files, eq(messageAttachments.fileId, files.id))
            .where(inArray(messageAttachments.messageId, messageIds))
            .orderBy(messageAttachments.displayOrder)
        : Promise.resolve([]),
      messageIds.length > 0
        ? db
            .select({ messageId: messageBookmarks.messageId })
            .from(messageBookmarks)
            .where(
              and(
                eq(messageBookmarks.userId, userId),
                inArray(messageBookmarks.messageId, messageIds),
              ),
            )
        : Promise.resolve([]),
      parentIds.length > 0
        ? db
            .select({
              id: messages.id,
              content: messages.content,
              senderName: workspaceMemberDisplayName(
                workspaceMembers.displayName,
                profiles.displayName,
              ),
              deletedAt: messages.deletedAt,
            })
            .from(messages)
            .innerJoin(profiles, eq(messages.senderId, profiles.id))
            .leftJoin(
              workspaceMembers,
              and(
                eq(workspaceMembers.userId, messages.senderId),
                eq(workspaceMembers.workspaceId, workspaceId),
              ),
            )
            // 引用バーに他チャンネル/他ワークスペースの内容が漏れないよう、親は同一チャンネルに限定する
            .where(and(inArray(messages.id, parentIds), eq(messages.channelId, channelId)))
        : Promise.resolve([]),
    ])

    const reactionMap = new Map<string, ReactionDto[]>()
    for (const reaction of reactionRows) {
      if (!reactionMap.has(reaction.messageId)) reactionMap.set(reaction.messageId, [])
      const existing = reactionMap
        .get(reaction.messageId)!
        .find((entry) => entry.emoji === reaction.emoji)
      if (existing) {
        existing.count += 1
        existing.userNames.push(reaction.userName)
        if (reaction.userId === userId) existing.mine = true
      } else {
        reactionMap.get(reaction.messageId)!.push({
          emoji: reaction.emoji,
          count: 1,
          mine: reaction.userId === userId,
          userNames: [reaction.userName],
        })
      }
    }

    const attachmentMap = new Map<string, MessageDto['attachments']>()
    for (const attachment of attachmentRows) {
      if (!attachmentMap.has(attachment.messageId)) attachmentMap.set(attachment.messageId, [])
      attachmentMap.get(attachment.messageId)!.push({
        id: attachment.id,
        fileId: attachment.fileId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize,
        displayOrder: attachment.displayOrder,
      })
    }

    const bookmarkedIds = new Set(bookmarkRows.map((bookmark) => bookmark.messageId))
    const { filterUnblockedRecipients } = await import('@/lib/safety/blocks')
    const senderIds = [...new Set(rows.map(row => row.senderId).filter(id => id !== userId))]
    const visibleSenderIds = new Set(await filterUnblockedRecipients(userId, senderIds))

    // メンションは canonical な `<@userId>` で保存されているため、現在の表示名を read 時に解決して埋め込む。
    // これにより名前変更が全メッセージへ即座に反映される（Mobile の単純な置換クライアントも最新名で表示できる）。
    // 引用返信バーもメンションを `@表示名` で描画するため、親メッセージの userId も解決対象に含める。
    const mentionIds = [
      ...new Set([
        ...rows.flatMap((row) => extractMentionIds(row.content)),
        ...parentRows.flatMap((parent) =>
          parent.deletedAt ? [] : extractMentionIds(parent.content),
        ),
      ]),
    ]
    const nameMap = new Map<string, string>()
    if (mentionIds.length > 0) {
      const profileRows = await db
        .select({
          id: profiles.id,
          displayName: workspaceMemberDisplayName(
            workspaceMembers.displayName,
            profiles.displayName,
          ),
        })
        .from(profiles)
        .leftJoin(
          workspaceMembers,
          and(
            eq(workspaceMembers.userId, profiles.id),
            eq(workspaceMembers.workspaceId, workspaceId),
          ),
        )
        .where(inArray(profiles.id, mentionIds))
      for (const profile of profileRows) nameMap.set(profile.id, profile.displayName)
    }

    const parentMap = new Map<string, ReplyToDto>()
    for (const parent of parentRows) {
      parentMap.set(parent.id, {
        id: parent.id,
        senderName: parent.senderName,
        content: parent.deletedAt ? '' : hydrateMentions(parent.content, (id) => nameMap.get(id)),
        isDeleted: !!parent.deletedAt,
      })
    }

    const result: MessageDto[] = rows.map((row) => ({
      id: row.id,
      content: hydrateMentions(row.content, (id) => nameMap.get(id)),
      messageType: row.messageType,
      senderId: row.senderId,
      senderName: row.senderName,
      senderAvatarUrl: row.senderAvatarUrl ?? null,
      createdAt: row.createdAt.toISOString(),
      isEdited: row.updatedAt.getTime() > row.createdAt.getTime(),
      reactions: reactionMap.get(row.id) ?? [],
      attachments: attachmentMap.get(row.id) ?? [],
      parentMessageId: row.parentMessageId,
      replyTo: row.parentMessageId ? (parentMap.get(row.parentMessageId) ?? null) : null,
      bookmarked: bookmarkedIds.has(row.id),
      blocked: row.senderId !== userId && !visibleSenderIds.has(row.senderId),
    }))

    return NextResponse.json(result, {
      headers: { 'X-Cairn-Has-More': String(hasMore) },
    })
  } catch (err) {
    console.error('[/api/channels/[channelId]/messages GET] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
