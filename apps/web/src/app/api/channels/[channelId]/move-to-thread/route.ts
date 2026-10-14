// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { MOVE_TO_THREAD_MAX_MESSAGES, moveToThreadBodySchema } from '@cairn/shared'
import type { MoveToThreadResult } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess, requireRole } from '@/lib/permissions'

type RouteContext = { params: Promise<{ channelId: string }> }

class MoveToThreadError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'MoveToThreadError'
  }
}

const INVALID_SCOPE = '移動できないメッセージが含まれています。削除済み・システムメッセージ・他のチャンネルのメッセージは切り出せません'
const TOO_MANY = `一度にスレッドへ切り出せるのは${MOVE_TO_THREAD_MAX_MESSAGES}件までです`

/**
 * 親ワークスペースチャンネルのメッセージを、同じ親の新規スレッドまたは既存スレッドへ移す。
 * 作成・移動・付随データの付け替え・通知メッセージの投稿は 1 トランザクションで確定させる。
 */
export async function POST(req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = requireRole(ctx.role, 'member')
  if (forbidden) return forbidden

  const { channelId } = await params
  const accessDenied = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
  if (accessDenied) return accessDenied

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 })
  }

  const rawIds = typeof rawBody === 'object' && rawBody !== null ? (rawBody as { messageIds?: unknown }).messageIds : undefined
  if (Array.isArray(rawIds) && rawIds.length > MOVE_TO_THREAD_MAX_MESSAGES) {
    return NextResponse.json({ error: TOO_MANY }, { status: 400 })
  }

  const parsed = moveToThreadBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    const nameIssue = parsed.error.issues.some(issue => issue.path[0] === 'threadName')
    return NextResponse.json(
      { error: nameIssue ? 'スレッド名は1〜60文字で入力してください' : 'リクエストの形式が不正です' },
      { status: 400 },
    )
  }
  const body = parsed.data

  if (body.threadId) {
    const threadDenied = await requireChannelAccess(ctx.workspaceId, ctx.userId, body.threadId, ctx.role)
    if (threadDenied) return threadDenied
  }

  try {
    const { db, channels, channelMembers, messages, tasks, profiles, workspaceMembers } = await import('@cairn/db')
    const { and, asc, eq, gt, gte, inArray, isNull, ne, or, sql } = await import('drizzle-orm')

    const [parent] = await db
      .select({
        id: channels.id,
        workspaceId: channels.workspaceId,
        type: channels.type,
        isPrivate: channels.isPrivate,
        parentChannelId: channels.parentChannelId,
      })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1)

    if (!parent || parent.workspaceId !== ctx.workspaceId) {
      return NextResponse.json({ error: 'チャンネルが見つかりません' }, { status: 404 })
    }
    if (parent.type !== 'workspace' || parent.parentChannelId !== null) {
      return NextResponse.json(
        { error: 'スレッドに切り出せるのは、ワークスペースのチャンネルのメッセージだけです' },
        { status: 400 },
      )
    }

    const result = await db.transaction(async (tx): Promise<MoveToThreadResult> => {
      // スレッド作成・メンバー追加・投稿と同じ親行で直列化し、移動中に新規の会話が割り込まないようにする。
      await tx.select({ id: channels.id }).from(channels).where(eq(channels.id, parent.id)).for('update').limit(1)

      // 1. 移動するメッセージを確定する（削除済み・システムメッセージは対象外）
      const movable = and(eq(messages.channelId, parent.id), isNull(messages.deletedAt), ne(messages.messageType, 'system'))
      let movedIds: string[]
      if (body.messageIds) {
        const requested = [...new Set(body.messageIds)]
        const found = await tx
          .select({ id: messages.id })
          .from(messages)
          .where(and(inArray(messages.id, requested), movable))
        if (found.length !== requested.length) throw new MoveToThreadError(400, INVALID_SCOPE)
        movedIds = found.map(row => row.id)
      } else {
        const [anchor] = await tx
          .select({ id: messages.id, createdAt: messages.createdAt })
          .from(messages)
          .where(and(eq(messages.id, body.fromMessageId!), movable))
          .limit(1)
        if (!anchor) throw new MoveToThreadError(400, INVALID_SCOPE)
        const after = await tx
          .select({ id: messages.id })
          .from(messages)
          .where(and(
            movable,
            or(
              gt(messages.createdAt, anchor.createdAt),
              and(eq(messages.createdAt, anchor.createdAt), gte(messages.id, anchor.id)),
            ),
          ))
          .orderBy(asc(messages.createdAt), asc(messages.id))
          .limit(MOVE_TO_THREAD_MAX_MESSAGES + 1)
        if (after.length > MOVE_TO_THREAD_MAX_MESSAGES) throw new MoveToThreadError(400, TOO_MANY)
        movedIds = after.map(row => row.id)
      }
      if (movedIds.length === 0) throw new MoveToThreadError(400, INVALID_SCOPE)

      // 2. 移動先を用意する
      let threadId: string
      let threadName: string
      if (body.threadId) {
        const [thread] = await tx
          .select({
            id: channels.id,
            name: channels.name,
            workspaceId: channels.workspaceId,
            type: channels.type,
            parentChannelId: channels.parentChannelId,
            archived: sql<boolean>`coalesce(to_jsonb(${channels})->>'archived_at', '') <> ''`,
          })
          .from(channels)
          .where(eq(channels.id, body.threadId))
          .for('update')
          .limit(1)
        if (!thread || thread.workspaceId !== ctx.workspaceId || thread.type !== 'workspace') {
          throw new MoveToThreadError(404, 'スレッドが見つかりません')
        }
        if (thread.parentChannelId !== parent.id) {
          throw new MoveToThreadError(400, 'このチャンネルのスレッドではありません')
        }
        if (thread.archived) throw new MoveToThreadError(400, 'アーカイブ済みのスレッドには移動できません')
        threadId = thread.id
        threadName = thread.name ?? ''
      } else {
        const [created] = await tx
          .insert(channels)
          .values({
            workspaceId: parent.workspaceId,
            parentChannelId: parent.id,
            type: 'workspace',
            name: body.threadName!,
            isPrivate: parent.isPrivate,
          })
          .returning({ id: channels.id })
        if (!created) throw new Error('thread insert returned no rows')
        const members = await tx
          .select({ userId: channelMembers.userId })
          .from(channelMembers)
          .where(eq(channelMembers.channelId, parent.id))
        if (members.length > 0) {
          await tx
            .insert(channelMembers)
            .values(members.map(member => ({ channelId: created.id, userId: member.userId })))
            .onConflictDoNothing()
        }
        threadId = created.id
        threadName = body.threadName!
      }

      // 3. メッセージと、メッセージに紐づく付随データを付け替える
      const moved = await tx
        .update(messages)
        .set({ channelId: threadId })
        .where(and(inArray(messages.id, movedIds), eq(messages.channelId, parent.id)))
        .returning({ id: messages.id })
      if (moved.length !== movedIds.length) throw new MoveToThreadError(409, '他の操作と競合しました。もう一度お試しください')

      await tx.update(tasks).set({ channelId: threadId }).where(inArray(tasks.sourceMessageId, movedIds))

      // 通知は data の channelId でチャンネルに紐づく（メンションの未読集計・遷移先）。
      await tx.execute(sql`
        UPDATE notifications
        SET data = jsonb_set(data, '{channelId}', to_jsonb(${threadId}::text))
        WHERE data->>'messageId' IN ${movedIds}
          AND data->>'channelId' = ${parent.id}
      `)
      await tx.execute(sql`
        UPDATE content_reports SET channel_id = ${threadId}
        WHERE message_id IN ${movedIds} AND channel_id = ${parent.id}
      `)
      await tx.execute(sql`
        UPDATE ai_nudges SET channel_id = ${threadId}
        WHERE message_id IN ${movedIds} AND channel_id = ${parent.id}
      `)

      // 4. 既読位置: 親での既読位置をスレッドへ引き継ぎ、移動したメッセージが未読扱いに戻らないようにする。
      await tx.execute(sql`
        INSERT INTO channel_read_states (user_id, channel_id, last_read_at, last_read_message_id, unread_mention_count, updated_at)
        SELECT user_id, ${threadId}::uuid, last_read_at,
               CASE WHEN last_read_message_id IN ${movedIds} THEN last_read_message_id ELSE NULL END,
               0, now()
        FROM channel_read_states
        WHERE channel_id = ${parent.id}
        ON CONFLICT (user_id, channel_id) DO UPDATE SET
          last_read_at = greatest(channel_read_states.last_read_at, excluded.last_read_at),
          last_read_message_id = CASE
            WHEN excluded.last_read_at > channel_read_states.last_read_at THEN excluded.last_read_message_id
            ELSE channel_read_states.last_read_message_id
          END,
          updated_at = now()
      `)
      // 通知の付け替え後に、親とスレッド両方のメンション未読数を /api/channels/[channelId]/read と同じ式で数え直す。
      await tx.execute(sql`
        UPDATE channel_read_states AS crs
        SET unread_mention_count = (
              SELECT count(*)::integer
              FROM notifications n
              WHERE n.user_id = crs.user_id
                AND n.type = 'mention'
                AND n.read_at IS NULL
                AND n.data->>'channelId' = crs.channel_id::text
            ),
            updated_at = now()
        WHERE crs.channel_id IN (${parent.id}, ${threadId})
          AND crs.user_id IN (SELECT user_id FROM channel_read_states WHERE channel_id = ${parent.id})
      `)

      // 5. AI 巡回: 巡回済みの範囲をスレッドへ引き継ぎ、移動したメッセージを再巡回しない。
      await tx.execute(sql`
        INSERT INTO ai_scan_states (channel_id, last_scanned_message_id, last_scanned_at)
        SELECT ${threadId}::uuid,
               CASE WHEN last_scanned_message_id IN ${movedIds} THEN last_scanned_message_id ELSE NULL END,
               last_scanned_at
        FROM ai_scan_states
        WHERE channel_id = ${parent.id}
        ON CONFLICT (channel_id) DO NOTHING
      `)

      // 6. 元のチャンネルに移動の記録を system メッセージとして残す（プロジェクト更新通知と同じ表示）。
      const [actor] = await tx
        .select({ displayName: sql<string>`coalesce(${workspaceMembers.displayName}, ${profiles.displayName})` })
        .from(profiles)
        .leftJoin(
          workspaceMembers,
          and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
        )
        .where(eq(profiles.id, ctx.userId))
        .limit(1)
      await tx.insert(messages).values({
        channelId: parent.id,
        senderId: ctx.userId,
        messageType: 'system',
        content: `${actor?.displayName ?? '不明'}さんが${movedIds.length}件のメッセージを ┗${threadName} に移動しました`,
        createdAt: sql`clock_timestamp()`,
        updatedAt: sql`clock_timestamp()`,
      })

      return { threadId, movedCount: movedIds.length }
    })

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof MoveToThreadError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[/api/channels/[channelId]/move-to-thread POST] DB error:', err)
    return NextResponse.json({ error: 'スレッドへの切り出しに失敗しました' }, { status: 500 })
  }
}
