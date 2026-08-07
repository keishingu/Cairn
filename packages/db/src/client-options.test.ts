// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { nodePostgresPoolOptions } from './client-options'

describe('nodePostgresPoolOptions', () => {
  it('Supavisor の接続とクエリ待機をサーバーレス向けに制限する', () => {
    expect(nodePostgresPoolOptions).toEqual({
      max: 1,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
      query_timeout: 30_000,
    })
  })
})
