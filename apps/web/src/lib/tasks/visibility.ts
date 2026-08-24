// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { channelMembers, channels, tasks } from '@cairn/db'
import { sql } from 'drizzle-orm'

// チャンネル由来タスクはチャンネルの公開範囲を継承する。
// private のタイトルや存在を非参加者へ返さない。
export function taskChannelVisibilityCondition(userId: string) {
  return sql<boolean>`(
    ${tasks.channelId} is null
    or ${channels.isPrivate} = false
    or exists (
      select 1 from ${channelMembers}
      where ${channelMembers.channelId} = ${tasks.channelId}
        and ${channelMembers.userId} = ${userId}
    )
  )`
}
