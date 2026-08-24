// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { channelMembers, channels, tasks } from '@cairn/db'
import { and, eq, inArray, or, sql } from 'drizzle-orm'

export function taskChannelMembershipCondition(userId: string) {
  return sql<boolean>`exists (
    select 1 from ${channelMembers}
    where ${channelMembers.channelId} = ${tasks.channelId}
      and ${channelMembers.userId} = ${userId}
  )`
}

// チャンネル由来タスクはチャンネルの公開範囲を継承する。
// private のタイトルや存在を非参加者へ返さない。
export function taskChannelVisibilityCondition(userId: string) {
  const isChannelMember = taskChannelMembershipCondition(userId)
  return sql<boolean>`(
    ${tasks.channelId} is null
    or ${channels.isPrivate} = false
    or ${isChannelMember}
  )`
}

// ゲストは参加プロジェクト、または参加済みワークスペースチャンネルのタスクだけを参照できる。
export function guestTaskScopeCondition(userId: string, projectIds: string[]) {
  const scopes = [and(
    eq(channels.type, 'workspace'),
    taskChannelMembershipCondition(userId),
  )]
  if (projectIds.length > 0) scopes.push(inArray(tasks.projectId, projectIds))
  return or(...scopes)!
}
