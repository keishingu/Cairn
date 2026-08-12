// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { db } from '@cairn/db'
import { sql } from 'drizzle-orm'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function runForActiveMessageSender<T>(
  messageId: string,
  workspaceId: string,
  senderId: string,
  action: (tx: Transaction) => Promise<T>,
): Promise<T | null> {
  return db.transaction(async (tx) => {
    // 退会処理が排他ロックするmembership行を共有ロックする。先に退会が完了した
    // 場合は行が見つからず、先に通知処理が始まった場合は退会側が完了まで待つ。
    const source = await tx.execute(sql`
      select 1
      from workspace_members wm
      join messages m
        on m.id = ${messageId}
       and m.sender_id = wm.user_id
      where wm.user_id = ${senderId}
        and wm.workspace_id = ${workspaceId}
        and wm.membership_status = 'active'
        and m.deleted_at is null
      for share of wm
    `)
    if (source.rows.length === 0) return null
    return action(tx)
  })
}
