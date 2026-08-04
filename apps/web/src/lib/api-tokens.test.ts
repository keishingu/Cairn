// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { integer, PgDialect, pgTable, timestamp } from 'drizzle-orm/pg-core'
import {
  API_TOKEN_PREFIX,
  apiTokenAllows,
  buildApiTokenRateLimitUpdate,
  createApiToken,
  hashApiToken,
  isApiTokenAccessEnabled,
  runWithApiTokenAccess,
} from './api-tokens'

describe('APIトークン', () => {
  it('十分なランダム長を持つPATを作り、平文ではなくハッシュを返す', () => {
    const first = createApiToken()
    const second = createApiToken()

    expect(first.token).toMatch(/^cairn_pat_[A-Za-z0-9_-]{43}$/)
    expect(first.token.startsWith(API_TOKEN_PREFIX)).toBe(true)
    expect(first.hash).toBe(hashApiToken(first.token))
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(first.hash).not.toContain(first.token)
    expect(first.prefix).toBe(first.token.slice(0, API_TOKEN_PREFIX.length + 8))
    expect(second.token).not.toBe(first.token)
  })

  it('writeはreadを包含し、readはwrite操作を許可しない', () => {
    expect(apiTokenAllows('read', 'read')).toBe(true)
    expect(apiTokenAllows('read', 'write')).toBe(false)
    expect(apiTokenAllows('write', 'read')).toBe(true)
    expect(apiTokenAllows('write', 'write')).toBe(true)
  })

  it('レート制限更新SQLはJavaScriptのDateをバインドせずDB時刻で計算する', () => {
    const table = pgTable('api_tokens', {
      rateLimitWindowStartedAt: timestamp('rate_limit_window_started_at', {
        withTimezone: true,
      }).notNull(),
      rateLimitCount: integer('rate_limit_count').notNull(),
    })
    const dialect = new PgDialect()
    const update = buildApiTokenRateLimitUpdate(table)

    for (const value of Object.values(update)) {
      const query = dialect.sqlToQuery(value)
      expect(query.params).toEqual([])
      expect(query.sql).toContain('current_timestamp')
    }
  })

  it('PAT利用許可を検証済みMCPリクエストの非同期コンテキスト内だけへ限定する', async () => {
    expect(isApiTokenAccessEnabled()).toBe(false)
    await runWithApiTokenAccess(async () => {
      await Promise.resolve()
      expect(isApiTokenAccessEnabled()).toBe(true)
    })
    expect(isApiTokenAccessEnabled()).toBe(false)
  })
})
