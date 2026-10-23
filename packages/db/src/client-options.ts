// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export const nodePostgresPoolOptions = {
  // Vercel Function インスタンスあたりの接続数を抑え、pg 側でクエリを直列化する。
  max: 1,
  // warm インスタンスが Supavisor のクライアント枠を長時間保持しないようにする。
  idleTimeoutMillis: 20_000,
  // 接続確立または pool の空き待ちが長引いた場合は早く失敗する。
  connectionTimeoutMillis: 10_000,
  // Supavisor から応答がなくても Vercel の実行上限まで query を待ち続けない。
  query_timeout: 30_000,
} as const
