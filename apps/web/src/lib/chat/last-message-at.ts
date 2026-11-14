// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * チャンネルごとの最終投稿時刻（削除済みは除く）。チャット一覧の「更新順」に使う。
 * チャンネルごとに idx_messages_channel (channel_id, created_at) を末尾から1件だけ引くため、
 * 履歴の長さに比例せずチャンネル数ぶんの索引探索で済む（全件の max 集計はしない）。
 */
export async function fetchLastMessageAt(channelIds: string[]): Promise<Map<string, string>> {
  if (channelIds.length === 0) return new Map()
  const { db } = await import('@cairn/db')
  const { sql } = await import('drizzle-orm')
  const ids = sql.join(channelIds.map(id => sql`${id}::uuid`), sql`, `)
  const result = await db.execute<{ channel_id: string; last_message_at: string | Date }>(sql`
    select c.id as channel_id, m.created_at as last_message_at
    from unnest(array[${ids}]) as c(id)
    cross join lateral (
      select created_at
      from messages
      where messages.channel_id = c.id and messages.deleted_at is null
      order by created_at desc
      limit 1
    ) m
  `)
  return new Map(result.rows.map(row => [row.channel_id, new Date(row.last_message_at).toISOString()]))
}
