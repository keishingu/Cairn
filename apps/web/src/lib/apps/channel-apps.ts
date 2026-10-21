// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// チャンネルで使えるアプリ（作成メニューの起動口）と、Bot のチャンネル参加の判定

export type EntryPoint = { command: string; label: string }

export function parseEntryPoints(value: unknown): EntryPoint[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is EntryPoint =>
      typeof entry === 'object' && entry !== null && typeof (entry as EntryPoint).command === 'string' && typeof (entry as EntryPoint).label === 'string',
  )
}

/** Bot がチャンネル（スレッドなら親でもよい）に参加しているか */
export async function isAppInChannel(installationId: string, channelId: string, parentChannelId: string | null): Promise<boolean> {
  const { db, appChannelMemberships } = await import('@cairn/db')
  const { and, eq, inArray } = await import('drizzle-orm')
  const [membership] = await db
    .select({ channelId: appChannelMemberships.channelId })
    .from(appChannelMemberships)
    .where(and(eq(appChannelMemberships.installationId, installationId), inArray(appChannelMemberships.channelId, parentChannelId ? [channelId, parentChannelId] : [channelId])))
    .limit(1)
  return !!membership
}

/** アーカイブ済みか。親チャンネルをアーカイブしても配下スレッドの archived_at は残らないため、親も見る（一覧・AI 巡回と同じ扱い） */
export async function isChannelArchived(channel: { archivedAt: Date | null; parentChannelId: string | null }): Promise<boolean> {
  if (channel.archivedAt) return true
  if (!channel.parentChannelId) return false
  const { db, channels } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const [parent] = await db.select({ archivedAt: channels.archivedAt }).from(channels).where(eq(channels.id, channel.parentChannelId)).limit(1)
  return !!parent?.archivedAt
}
