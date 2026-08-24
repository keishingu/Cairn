// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { taskChannelVisibilityCondition } from './visibility'

describe('taskChannelVisibilityCondition', () => {
  it('非公開チャンネルのタスクをチャンネルメンバーだけに絞る', () => {
    const query = new PgDialect().sqlToQuery(taskChannelVisibilityCondition('user-1'))

    expect(query.sql).toContain('"tasks"."channel_id" is null')
    expect(query.sql).toContain('"channels"."is_private" = false')
    expect(query.sql).toContain('"channel_members"."channel_id" = "tasks"."channel_id"')
    expect(query.sql).toContain('"channel_members"."user_id" = $1')
    expect(query.params).toEqual(['user-1'])
  })
})
