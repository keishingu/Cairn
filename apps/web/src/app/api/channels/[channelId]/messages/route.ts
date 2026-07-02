// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { type AttachmentDto, type MessageType, postMessageSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { canAccessFile, requireChannelAccess } from '@/lib/permissions'
import { inngest } from '@/lib/inngest/client'
import type { MessageCreatedEvent } from '@/lib/inngest/events'
import { parseCheckboxes } from '@/lib/chat/checkboxes'
import { canonicalizeMentions, extractMentionIds, hydrateMentions } from '@/lib/chat/mentions'

export interface ReactionDto {
  emoji: string
  count: number
  mine: boolean
  // リアクションしたユーザーの表示名（PC ではホバーで一覧表示する）
  userNames: string[]
}

// 引用返信の参照先メッセージのサマリ
export interface ReplyToDto {
  id: string
  senderName: string
  content: string
  isDeleted: boolean
}

export interface MessageDto {
  id: string
  content: string
  messageType: MessageType
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  createdAt: string
  isEdited: boolean
  reactions: ReactionDto[]
  attachments: AttachmentDto[]
  parentMessageId: string | null
  replyTo: ReplyToDto | null
  bookmarked: boolean
}

type RouteContext = { params: Promise<{ channelId: string }> }

function getPendingChannelIdFromMetadata(metadata: unknown): string | null {
  const meta = (metadata ?? {}) as Record<string, unknown>
  const pendingChannelId = meta['pendingChannelId']
  return typeof pendingChannelId === 'string' ? pendingChannelId : null
}

function finalizeAttachmentMetadata(metadata: unknown, channelId: string): Record<string, unknown> {
  const meta = { ...((metadata ?? {}) as Record<string, unknown>) }
  delete meta['pendingChannelId']

  const channelIds = new Set<string>()
  const legacyChannelId = meta['channelId']
  if (typeof legacyChannelId === 'string') channelIds.add(legacyChannelId)

  const existingChannelIds = meta['channelIds']
  if (Array.isArray(existingChannelIds)) {
    for (const id of existingChannelIds) {
      if (typeof id === 'string') channelIds.add(id)
    }
  }

  channelIds.add(channelId)
  delete meta['channelId']

  return {
    ...meta,
    channelIds: [...channelIds],
  }
}

export async function GET(req: Request, { params }: RouteContext) {
  const { channelId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId)
  if (forbidden) return forbidden

  // ブックマーク・パーマリンクから開いた古いメッセージが直近100件の外にある場合、
  // その前後を中心としたウィンドウを取得する（無いと該当メッセージが読み込まれず、
  // ジャンプ先がスクロール表示されないまま静かに失敗する）
  const aroundMessageId = new URL(req.url).searchParams.get('around')

  try {
    const { db } = await import('@cairn/db')
    const { messages, profiles, messageReactions, messageAttachments, messageBookmarks, files } = await import('@cairn/db')
    const { eq, isNull, inArray, and, lte, gt } = await import('drizzle-orm')
    const { desc, asc } = await import('drizzle-orm')

    const { workspaceMembers } = await import('@cairn/db')

    const selectFields = {
      id: messages.id,
      content: messages.content,
      messageType: messages.messageType,
      parentMessageId: messages.parentMessageId,
      senderId: messages.senderId,
      senderName: profiles.displayName,
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

    if (aroundMessageId) {
      const [anchor] = await db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(and(eq(messages.id, aroundMessageId), eq(messages.channelId, channelId), isNull(messages.deletedAt)))
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
            and(eq(workspaceMembers.userId, messages.senderId), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
          )
          .where(and(eq(messages.channelId, channelId), isNull(messages.deletedAt), lte(messages.createdAt, anchor.createdAt)))
          .orderBy(desc(messages.createdAt))
          .limit(50),
        db
          .select(selectFields)
          .from(messages)
          .innerJoin(profiles, eq(messages.senderId, profiles.id))
          .leftJoin(
            workspaceMembers,
            and(eq(workspaceMembers.userId, messages.senderId), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
          )
          .where(and(eq(messages.channelId, channelId), isNull(messages.deletedAt), gt(messages.createdAt, anchor.createdAt)))
          .orderBy(asc(messages.createdAt))
          .limit(50),
      ])

      beforeAndAnchor.reverse()
      rows = [...beforeAndAnchor, ...after]
    } else {
      rows = await db
        .select(selectFields)
        .from(messages)
        .innerJoin(profiles, eq(messages.senderId, profiles.id))
        .leftJoin(
          workspaceMembers,
          and(eq(workspaceMembers.userId, messages.senderId), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
        )
        .where(and(eq(messages.channelId, channelId), isNull(messages.deletedAt)))
        .orderBy(desc(messages.createdAt))
        .limit(100)

      rows.reverse()
    }

    const messageIds = rows.map(r => r.id)
    // 引用返信の参照先（表示中の100件の外にある可能性があるので別クエリで取得）
    const parentIds = [...new Set(rows.map(r => r.parentMessageId).filter((id): id is string => !!id))]

    const [reactionRows, attachmentRows, bookmarkRows, parentRows] = await Promise.all([
      messageIds.length > 0
        ? db
            .select({
              messageId: messageReactions.messageId,
              emoji: messageReactions.emoji,
              userId: messageReactions.userId,
              userName: profiles.displayName,
            })
            .from(messageReactions)
            .innerJoin(profiles, eq(messageReactions.userId, profiles.id))
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
            .where(and(eq(messageBookmarks.userId, ctx.userId), inArray(messageBookmarks.messageId, messageIds)))
        : Promise.resolve([]),
      parentIds.length > 0
        ? db
            .select({
              id: messages.id,
              content: messages.content,
              senderName: profiles.displayName,
              deletedAt: messages.deletedAt,
            })
            .from(messages)
            .innerJoin(profiles, eq(messages.senderId, profiles.id))
            // 引用バーに他チャンネル/他ワークスペースの内容が漏れないよう、親は同一チャンネルに限定する
            .where(and(inArray(messages.id, parentIds), eq(messages.channelId, channelId)))
        : Promise.resolve([]),
    ])

    const reactionMap = new Map<string, ReactionDto[]>()
    for (const r of reactionRows) {
      if (!reactionMap.has(r.messageId)) reactionMap.set(r.messageId, [])
      const existing = reactionMap.get(r.messageId)!.find(x => x.emoji === r.emoji)
      if (existing) {
        existing.count++
        existing.userNames.push(r.userName)
        if (r.userId === ctx.userId) existing.mine = true
      } else {
        reactionMap.get(r.messageId)!.push({ emoji: r.emoji, count: 1, mine: r.userId === ctx.userId, userNames: [r.userName] })
      }
    }

    const attachmentMap = new Map<string, AttachmentDto[]>()
    for (const a of attachmentRows) {
      if (!attachmentMap.has(a.messageId)) attachmentMap.set(a.messageId, [])
      attachmentMap.get(a.messageId)!.push({
        id: a.id,
        fileId: a.fileId,
        fileName: a.fileName,
        mimeType: a.mimeType,
        fileSize: a.fileSize,
        displayOrder: a.displayOrder,
      })
    }

    const bookmarkedIds = new Set(bookmarkRows.map(b => b.messageId))

    // メンションは canonical な `<@userId>` で保存されているため、現在の表示名を read 時に解決して埋め込む。
    // これにより名前変更が全メッセージへ即座に反映される（Mobile の単純な置換クライアントも最新名で表示できる）。
    // 引用返信バーもメンションを `@表示名` で描画するため、親メッセージの userId も解決対象に含める。
    const mentionIds = [...new Set([
      ...rows.flatMap(r => extractMentionIds(r.content)),
      ...parentRows.flatMap(p => (p.deletedAt ? [] : extractMentionIds(p.content))),
    ])]
    const nameMap = new Map<string, string>()
    if (mentionIds.length > 0) {
      const profileRows = await db
        .select({ id: profiles.id, displayName: profiles.displayName })
        .from(profiles)
        .where(inArray(profiles.id, mentionIds))
      for (const p of profileRows) nameMap.set(p.id, p.displayName)
    }

    const parentMap = new Map<string, ReplyToDto>()
    for (const p of parentRows) {
      parentMap.set(p.id, {
        id: p.id,
        senderName: p.senderName,
        content: p.deletedAt ? '' : hydrateMentions(p.content, id => nameMap.get(id)),
        isDeleted: !!p.deletedAt,
      })
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
      reactions: reactionMap.get(r.id) ?? [],
      attachments: attachmentMap.get(r.id) ?? [],
      parentMessageId: r.parentMessageId,
      replyTo: r.parentMessageId ? parentMap.get(r.parentMessageId) ?? null : null,
      bookmarked: bookmarkedIds.has(r.id),
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/channels/[channelId]/messages GET] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  const { channelId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId)
  if (forbidden) return forbidden

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = postMessageSchema.safeParse({ ...(body as object), channelId })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { messages, profiles, messageAttachments, files } = await import('@cairn/db')
    const { eq, and, isNull, inArray } = await import('drizzle-orm')

    // 引用返信の親は、同一チャンネルの未削除メッセージに限定する。
    // 他チャンネルの ID を親に偽装して内容を引用バーに漏らす攻撃を防ぐ
    if (parsed.data.parentMessageId) {
      const [parent] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(
          eq(messages.id, parsed.data.parentMessageId),
          eq(messages.channelId, channelId),
          isNull(messages.deletedAt),
        ))
        .limit(1)
      if (!parent) {
        return NextResponse.json({ error: '返信先のメッセージが見つかりません' }, { status: 422 })
      }
    }

    const attachmentFileIds = parsed.data.attachmentFileIds ?? []
    // メンションは名前なしの canonical 形式で保存する（埋め込み名が来ても除去）
    const content = canonicalizeMentions(parsed.data.content)
    let fileRows: Array<{
      id: string
      workspaceId: string
      projectId: string | null
      uploadedBy: string
      metadata: unknown
      mimeType: string | null
      storagePath: string | null
    }> = []

    if (attachmentFileIds.length > 0) {
      fileRows = await db
        .select({
          id: files.id,
          workspaceId: files.workspaceId,
          projectId: files.projectId,
          uploadedBy: files.uploadedBy,
          metadata: files.metadata,
          mimeType: files.mimeType,
          storagePath: files.storagePath,
        })
        .from(files)
        .where(inArray(files.id, attachmentFileIds))

      if (fileRows.length !== new Set(attachmentFileIds).size) {
        return NextResponse.json({ error: '添付ファイルが見つかりません' }, { status: 404 })
      }

      const accessResults = await Promise.all(
        fileRows.map(file => canAccessFile(ctx.workspaceId, ctx.userId, file, { pendingChannelId: channelId })),
      )
      if (accessResults.some(canAccess => !canAccess)) {
        return NextResponse.json({ error: '添付ファイルにアクセスする権限がありません' }, { status: 403 })
      }
    }

    // プロジェクトチャンネルの場合、- [ ] チェックボックスをタスクに自動変換するため先にプロジェクトを解決しておく
    const checkboxes = parseCheckboxes(content)
    const { channels, tasks } = await import('@cairn/db')
    const [channel] = checkboxes.length > 0
      ? await db
          .select({ projectId: channels.projectId })
          .from(channels)
          .where(eq(channels.id, channelId))
          .limit(1)
      : [undefined]

    const inserted = await db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(messages)
        .values({
          channelId,
          senderId: ctx.userId,
          content,
          messageType: parsed.data.messageType ?? 'text',
          parentMessageId: parsed.data.parentMessageId ?? null,
        })
        .returning({ id: messages.id, content: messages.content, senderId: messages.senderId, createdAt: messages.createdAt })

      if (!msg) throw new Error('Insert returned no rows')

      if (attachmentFileIds.length > 0) {
        await tx.insert(messageAttachments).values(
          attachmentFileIds.map((fileId, i) => ({
            messageId: msg.id,
            fileId,
            displayOrder: i,
          })),
        )

        await Promise.all(
          fileRows.map(file => tx
            .update(files)
            .set({ metadata: finalizeAttachmentMetadata(file.metadata, channelId) })
            .where(eq(files.id, file.id))),
        )
      }

      // メッセージ本文のチェックボックスとタスクの作成を同一トランザクションにし、
      // タスク作成が失敗した場合にメッセージだけが残る不整合を防ぐ
      if (channel?.projectId) {
        const projectId = channel.projectId
        await tx.insert(tasks).values(
          checkboxes.map(cb => ({
            projectId,
            title: cb.text,
            status: (cb.checked ? 'done' : 'todo') as 'done' | 'todo',
            priority: 'medium' as const,
            createdBy: ctx.userId,
            sourceMessageId: msg.id,
            sourceCheckboxIndex: cb.index,
          })),
        )
      }

      return msg
    })

    const { workspaceMembers } = await import('@cairn/db')
    const { and: and2 } = await import('drizzle-orm')

    const [profile] = await db
      .select({
        displayName: profiles.displayName,
        avatarUrl: workspaceMembers.avatarUrl,
      })
      .from(profiles)
      .leftJoin(
        workspaceMembers,
        and2(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
      )
      .where(eq(profiles.id, inserted.senderId))

    const senderName = profile?.displayName ?? '不明'

    inngest.send({
      name: 'message/created',
      data: {
        messageId: inserted.id,
        channelId,
        workspaceId: ctx.workspaceId,
        senderId: ctx.userId,
        senderName,
        content: inserted.content,
        attachmentFileIds: parsed.data.attachmentFileIds ?? [],
      },
    } satisfies MessageCreatedEvent).catch((err: unknown) => {
      console.warn('[inngest] message/created send failed (Inngest not running?):', err)
    })

    const { isIndexable } = await import('@/lib/ai/extract-text')
    await Promise.all(
      fileRows
        .filter(file =>
          getPendingChannelIdFromMetadata(file.metadata) === channelId &&
          typeof file.mimeType === 'string' &&
          typeof file.storagePath === 'string' &&
          isIndexable(file.mimeType ?? ''),
        )
        .map(async (file) => {
          try {
            await inngest.send({
              name: 'file/uploaded',
              data: {
                fileId: file.id,
                workspaceId: ctx.workspaceId,
                mimeType: file.mimeType,
                storagePath: file.storagePath,
              },
            })
          } catch (err) {
            console.warn('[inngest] file/uploaded send failed (message already committed):', err)
          }
        }),
    )

    return NextResponse.json({
      id: inserted.id,
      content: inserted.content,
      messageType: parsed.data.messageType ?? 'text',
      senderId: inserted.senderId,
      senderName,
      senderAvatarUrl: profile?.avatarUrl ?? null,
      createdAt: inserted.createdAt.toISOString(),
      isEdited: false,
      reactions: [],
      attachments: [],
      parentMessageId: parsed.data.parentMessageId ?? null,
      replyTo: null,
      bookmarked: false,
    } satisfies MessageDto, { status: 201 })
  } catch (err) {
    console.error('[/api/channels/[channelId]/messages POST] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
