// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  PROJECT_UPDATE_SUPERSEDE_WINDOW_MS,
  buildProjectUpdateMessage,
  supersededProjectUpdateMessageIds,
} from './project-update-message'

type Database = (typeof import('@cairn/db'))['db']
/** 呼び出し元のトランザクション。リソースの更新と通知を同じ順序で確定させるために渡す */
export type ProjectUpdateTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * プロジェクトの決定事項（ステータス・日程・場所・マイルストーンなど）の変更を、
 * プロジェクトチャンネルへ system メッセージで残す。
 * 通知は補助なので、失敗しても呼び出し元の更新は成功のままにする（例外を投げない）。
 *
 * 値を持つ通知（期間など）は、リソースを更新したトランザクションを `tx` で渡すこと。
 * 別々に確定させると、同時に来た更新どうしで「後から確定した値」と「最後に出た通知」が食い違い、
 * 古い値の通知が新しい通知を消してしまう。`tx` の中ではセーブポイントを切るので、
 * 通知が失敗しても呼び出し元の更新は巻き戻らない。
 */
export async function postProjectUpdateMessage(params: {
  projectId: string
  actorId: string
  changes: ReadonlyArray<string>
  tx?: ProjectUpdateTransaction
}): Promise<void> {
  const { projectId, actorId, changes, tx: outerTx } = params
  if (changes.length === 0) return

  try {
    const { db, channels, messages, profiles } = await import('@cairn/db')
    const { and, desc, eq, gte, inArray, isNull, sql } = await import('drizzle-orm')

    await (outerTx ?? db).transaction(async (tx) => {
      const [channel] = await tx
        .select({ id: channels.id })
        .from(channels)
        .where(and(eq(channels.projectId, projectId), eq(channels.type, 'project'), isNull(channels.milestoneId)))
        .limit(1)
      if (!channel) return

      const [actor] = await tx
        .select({ displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.id, actorId))
      const actorName = actor?.displayName ?? '不明'

      // 同時に来た更新どうしで、整理と投稿の順序が入れ替わらないようにする
      await tx.select({ id: channels.id }).from(channels).where(eq(channels.id, channel.id)).for('update')

      // 同じ項目を続けて直した時に通知が何行も並ばないよう、直前に並ぶ通知のうち同じ項目のものを消す。
      // 対象は「最後の通常の投稿より後・24時間以内」の通知すべて。件数で打ち切ると、
      // 多くの項目を続けて更新した時に古い通知が取り残される
      const notBefore = new Date(Date.now() - PROJECT_UPDATE_SUPERSEDE_WINDOW_MS)
      const recent = await tx
        .select({
          id: messages.id,
          messageType: messages.messageType,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(
          and(
            eq(messages.channelId, channel.id),
            isNull(messages.deletedAt),
            eq(messages.messageType, 'system'),
            gte(messages.createdAt, notBefore),
            sql`${messages.createdAt} > coalesce((
              select max(m.created_at) from messages m
              where m.channel_id = ${channel.id} and m.deleted_at is null and m.message_type <> 'system'
            ), '-infinity'::timestamptz)`,
          ),
        )
        .orderBy(desc(messages.createdAt))
      const supersededIds = supersededProjectUpdateMessageIds(recent, changes, notBefore)
      if (supersededIds.length > 0) {
        await tx
          .update(messages)
          .set({ deletedAt: sql`clock_timestamp()` })
          .where(inArray(messages.id, supersededIds))
      }

      for (const change of changes) {
        await tx.insert(messages).values({
          channelId: channel.id,
          senderId: actorId,
          messageType: 'system',
          content: buildProjectUpdateMessage(actorName, change),
          createdAt: sql`clock_timestamp()`,
          updatedAt: sql`clock_timestamp()`,
        })
      }
    })
  } catch (e) {
    console.warn('[postProjectUpdateMessage] system message insert failed (skipped):', e)
  }
}
