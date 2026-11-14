// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import type { BotContext } from '../bot-tokens'
import { resolveBotChannel } from './channel-access'
import { fail, isUuid, stringArg, type WebApiArgs, type WebApiResult } from './types'

// 非活性メンバーは未所属と同等なので、メンバーの参照は必ず active_workspace_members を経由する（AGENTS.md）

export async function usersInfo(bot: BotContext, args: WebApiArgs): Promise<WebApiResult> {
  const userId = stringArg(args, 'user')
  if (!isUuid(userId)) return fail('user_not_found')

  const { db, activeWorkspaceMembers, profiles } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [member] = await db
    .select({
      id: activeWorkspaceMembers.userId,
      displayName: workspaceMemberDisplayName(activeWorkspaceMembers.displayName, profiles.displayName),
      avatarUrl: activeWorkspaceMembers.avatarUrl,
    })
    .from(activeWorkspaceMembers)
    .innerJoin(profiles, eq(profiles.id, activeWorkspaceMembers.userId))
    .where(and(eq(activeWorkspaceMembers.workspaceId, bot.workspaceId), eq(activeWorkspaceMembers.userId, userId)))
    .limit(1)
  if (!member) return fail('user_not_found')

  return {
    ok: true,
    user: {
      id: member.id,
      team_id: bot.workspaceId,
      name: member.displayName,
      real_name: member.displayName,
      deleted: false,
      is_bot: false,
      profile: {
        display_name: member.displayName,
        real_name: member.displayName,
        ...(member.avatarUrl ? { image_72: member.avatarUrl } : {}),
      },
    },
  }
}

/**
 * Bot が参加しているチャンネルのメンバー。既存の /api/channels/[channelId]/members と同じく、
 * channel_members のうちワークスペースの active なメンバーを返す。Bot 自身は channel_members にいないので含まれない
 */
export async function conversationsMembers(bot: BotContext, args: WebApiArgs): Promise<WebApiResult> {
  const access = await resolveBotChannel(bot, stringArg(args, 'channel'))
  if (!access.ok) return fail(access.error)

  const { db, channelMembers, activeWorkspaceMembers } = await import('@cairn/db')
  const { and, asc, eq } = await import('drizzle-orm')
  const rows = await db
    .select({ userId: channelMembers.userId })
    .from(channelMembers)
    .innerJoin(
      activeWorkspaceMembers,
      and(eq(activeWorkspaceMembers.workspaceId, bot.workspaceId), eq(activeWorkspaceMembers.userId, channelMembers.userId)),
    )
    .where(eq(channelMembers.channelId, access.channel.id))
    .orderBy(asc(channelMembers.userId))

  // 第1段階はページ分割しない。Bolt が next_cursor を読むため、空の cursor を返して「続きなし」を示す
  return { ok: true, members: rows.map((row) => row.userId), response_metadata: { next_cursor: '' } }
}

export async function authTest(bot: BotContext): Promise<WebApiResult> {
  const { db, workspaces, profiles } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const [[workspace], [profile]] = await Promise.all([
    db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, bot.workspaceId)).limit(1),
    db.select({ displayName: profiles.displayName }).from(profiles).where(eq(profiles.id, bot.botProfileId)).limit(1),
  ])
  return {
    ok: true,
    url: process.env['APP_URL'] ?? '',
    team: workspace?.name ?? '',
    user: profile?.displayName ?? '',
    team_id: bot.workspaceId,
    user_id: bot.botProfileId,
    bot_id: bot.installationId,
    app_id: bot.appId,
    is_enterprise_install: false,
  }
}
