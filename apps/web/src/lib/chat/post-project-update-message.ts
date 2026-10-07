// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  PROJECT_UPDATE_SUPERSEDE_WINDOW_MS,
  buildProjectUpdateMessage,
  supersedeProjectUpdateMessages,
} from './project-update-message'

/**
 * プロジェクトの決定事項（ステータス・日程・場所・マイルストーンなど）の変更を、
 * プロジェクトチャンネルへ system メッセージで残す。
 * 通知は補助なので、失敗しても呼び出し元の更新は成功のままにする（例外を投げない）。
 */
export async function postProjectUpdateMessage(params: {
  projectId: string
  actorId: string
  changes: ReadonlyArray<string>
}): Promise<void> {
  const { projectId, actorId, changes } = params
  if (changes.length === 0) return

  try {
    const { db, channels, messages, profiles } = await import('@cairn/db')
    const { and, desc, eq, inArray, isNull, sql } = await import('drizzle-orm')

    const [channel] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.projectId, projectId), eq(channels.type, 'project'), isNull(channels.milestoneId)))
      .limit(1)
    if (!channel) return

    const [actor] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, actorId))
    const actorName = actor?.displayName ?? '不明'

    await db.transaction(async (tx) => {
      // 同時に来た更新どうしで、整理と投稿の順序が入れ替わらないようにする
      await tx.select({ id: channels.id }).from(channels).where(eq(channels.id, channel.id)).for('update')

      // 同じ項目を続けて直した時に通知が何行も並ばないよう、直前に並ぶ通知から上書きされた項目を取り除く
      const recent = await tx
        .select({
          id: messages.id,
          messageType: messages.messageType,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(and(eq(messages.channelId, channel.id), isNull(messages.deletedAt)))
        .orderBy(desc(messages.createdAt))
        .limit(20)
      const superseded = supersedeProjectUpdateMessages(
        recent,
        changes,
        new Date(Date.now() - PROJECT_UPDATE_SUPERSEDE_WINDOW_MS),
      )
      if (superseded.deleteIds.length > 0) {
        await tx
          .update(messages)
          .set({ deletedAt: sql`clock_timestamp()` })
          .where(inArray(messages.id, superseded.deleteIds))
      }
      for (const rewrite of superseded.rewrites) {
        await tx.update(messages).set({ content: rewrite.content }).where(eq(messages.id, rewrite.id))
      }

      await tx.insert(messages).values({
        channelId: channel.id,
        senderId: actorId,
        messageType: 'system',
        content: buildProjectUpdateMessage(actorName, changes),
        createdAt: sql`clock_timestamp()`,
        updatedAt: sql`clock_timestamp()`,
      })
    })
  } catch (e) {
    console.warn('[postProjectUpdateMessage] system message insert failed (skipped):', e)
  }
}
