// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export const postgresClientOptions = {
  // Supavisor transaction mode は prepared statement をサポートしない。
  prepare: false,
  // Vercel Function インスタンスあたりの接続数を抑える。
  max: 1,
  // warm インスタンスが Supavisor のクライアント枠を長時間保持しないようにする。
  idle_timeout: 20,
  // ネットワーク障害時に Vercel の実行上限まで接続を待ち続けない。
  connect_timeout: 10,
} as const
