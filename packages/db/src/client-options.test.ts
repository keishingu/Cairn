// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { postgresClientOptions } from './client-options'

describe('postgresClientOptions', () => {
  it('Supavisor のクライアント接続をサーバーレス向けに制限する', () => {
    expect(postgresClientOptions).toEqual({
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  })
})
