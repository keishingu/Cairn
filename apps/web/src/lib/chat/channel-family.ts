// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * チャンネルの「家族」（親ワークスペースチャンネルとその直下スレッド）の ID を返す。
 * スレッドへ切り出されたメッセージが、元の会話への返信引用を保てるようにするために使う。
 * ワークスペースチャンネル以外（プロジェクト・DM）には家族がなく、自分自身だけを返す。
 * 家族に含まれても閲覧できるとは限らないため、内容を返す前に呼び出し側が権限を確認すること。
 */
export async function loadChannelFamilyIds(channelId: string): Promise<string[]> {
  const { db, channels } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')

  const [self] = await db
    .select({ type: channels.type, parentChannelId: channels.parentChannelId })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)
  if (!self || self.type !== 'workspace') return [channelId]

  const rootId = self.parentChannelId ?? channelId
  const children = await db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.parentChannelId, rootId))

  return [...new Set([rootId, channelId, ...children.map(child => child.id)])]
}
