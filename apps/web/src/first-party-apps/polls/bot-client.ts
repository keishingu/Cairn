// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { appBaseUrl, getFirstPartyBotToken, selfCallHeaders } from '@/lib/apps/first-party'

// 投票アプリから Cairn への呼び出しは、外部アプリと同じく Bot トークンで Web API を HTTP で呼ぶだけにする
// （本体の内部関数を直接呼ぶ近道をしない。docs/app-platform-design.md §1・§7.1）

export class PollsBotApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly code: string,
  ) {
    super(`${method} failed: ${code}`)
    this.name = 'PollsBotApiError'
  }
}

const BOT_API_TIMEOUT_MS = 10_000

export async function callBotApi<T = Record<string, unknown>>(workspaceId: string, method: string, args: Record<string, unknown>): Promise<T> {
  const token = await getFirstPartyBotToken('polls', workspaceId)
  const res = await fetch(`${appBaseUrl()}/api/app-api/${method}`, {
    method: 'POST',
    // 同じデプロイへの呼び出しなので、Preview の Deployment Protection を自動化用の回避ヘッダーで通す
    headers: { ...selfCallHeaders(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    // 応答しない接続で呼び出し元（投票ごとに直列の描画など）を止めない。再試行は DB の状態から同じ結果に収束する
    signal: AbortSignal.timeout(BOT_API_TIMEOUT_MS),
  })
  // Vercel のデプロイ保護などで JSON 以外が返ったときも、黙って成功扱いにしない
  const body = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string } & T) | null
  if (!body?.ok) throw new PollsBotApiError(method, body?.error ?? `http_${res.status}`)
  return body
}
