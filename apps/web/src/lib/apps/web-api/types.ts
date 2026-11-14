// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppScope } from '@cairn/db'
import type { BotContext } from '../bot-tokens'

// Slack の Web API と同じ応答の形。HTTP ステータスは常に 200 で、成否は ok で表す（docs/app-platform-design.md §6）
export type WebApiResult =
  | ({ ok: true } & Record<string, unknown>)
  | ({ ok: false; error: string } & Record<string, unknown>)

/** form-urlencoded と JSON のどちらで来ても、値は文字列か JSON の値として受け取る */
export type WebApiArgs = Record<string, unknown>

export type WebApiMethod = {
  /** 必要なスコープ。auth.test のようにスコープが要らないものは null */
  scope: AppScope | null
  handle: (bot: BotContext, args: WebApiArgs) => Promise<WebApiResult>
}

export function fail(error: string, extra: Record<string, unknown> = {}): WebApiResult {
  return { ok: false, error, ...extra }
}

export function stringArg(args: WebApiArgs, name: string): string | undefined {
  const value = args[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 第1段階の ID は UUID のまま（§11 D3）。UUID でない値は DB に渡さず「見つからない」として返す */
export function isUuid(value: string | undefined): value is string {
  return value !== undefined && UUID.test(value)
}
