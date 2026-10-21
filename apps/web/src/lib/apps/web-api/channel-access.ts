// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotContext } from '../bot-tokens'
import { isUuid } from './types'

export type BotChannel = { id: string; workspaceId: string; type: 'workspace' | 'project' | 'dm'; projectId: string | null }

export type BotChannelResult = { ok: true; channel: BotChannel } | { ok: false; error: string }

/**
 * Bot がそのチャンネルを使えるか。権限はワークスペースロールではなく、スコープと app_channel_memberships だけで決める（§3.3）。
 * - 別ワークスペースのチャンネルは「存在しない」と同じに見せる（ID の総当たりで他ワークスペースの存在を知らせない）
 * - DM には第1段階では投稿させない
 * - スレッドは親チャンネルに Bot が参加していれば使える（スレッドは親の会話の一部のため）
 * - アーカイブ済みのスレッドには書き込ませない
 */
export async function resolveBotChannel(bot: Pick<BotContext, 'workspaceId' | 'installationId'>, channelId: string | undefined): Promise<BotChannelResult> {
  if (!isUuid(channelId)) return { ok: false, error: 'channel_not_found' }

  const { db, channels, appChannelMemberships } = await import('@cairn/db')
  const { and, eq, inArray } = await import('drizzle-orm')
  const [channel] = await db
    .select({
      id: channels.id,
      workspaceId: channels.workspaceId,
      type: channels.type,
      projectId: channels.projectId,
      parentChannelId: channels.parentChannelId,
      archivedAt: channels.archivedAt,
    })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)

  if (!channel || channel.workspaceId !== bot.workspaceId) return { ok: false, error: 'channel_not_found' }
  if (channel.type === 'dm') return { ok: false, error: 'method_not_supported_for_channel_type' }

  const memberChannelIds = channel.parentChannelId ? [channel.id, channel.parentChannelId] : [channel.id]
  const [membership] = await db
    .select({ channelId: appChannelMemberships.channelId })
    .from(appChannelMemberships)
    .where(and(eq(appChannelMemberships.installationId, bot.installationId), inArray(appChannelMemberships.channelId, memberChannelIds)))
    .limit(1)
  if (!membership) return { ok: false, error: 'not_in_channel' }
  if (channel.archivedAt) return { ok: false, error: 'is_archived' }

  return { ok: true, channel: { id: channel.id, workspaceId: bot.workspaceId, type: channel.type, projectId: channel.projectId } }
}
