// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { BotAuthError, verifyBotToken } from '@/lib/apps/bot-tokens'
import { dispatchWebApi, isKnownWebApiMethod, type WebApiArgs } from '@/lib/apps/web-api'

// アプリの Bot が使う Web API。パスと応答は Slack（https://slack.com/api/<method>）に合わせ、
// HTTP ステータスは常に 200、成否は `{ ok }` で返す（docs/app-platform-design.md §6）。
// 人間のセッション・PAT・MCP の資格情報では通さず、Bot トークンだけで認証する

const MAX_BODY_BYTES = 1024 * 1024

async function readArgs(req: Request): Promise<WebApiArgs | null> {
  const body = await req.text()
  if (body.length > MAX_BODY_BYTES) return null
  if (!body) return {}
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      const parsed: unknown = JSON.parse(body)
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as WebApiArgs) : null
    } catch {
      return null
    }
  }
  // Bolt / @slack/web-api の既定は form-urlencoded（blocks などは JSON 文字列で入る）
  return Object.fromEntries(new URLSearchParams(body))
}

function bearerToken(req: Request, args: WebApiArgs): string | null {
  const header = req.headers.get('authorization')
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim() || null
  // Slack と同じく本文の token も受け付ける（ヘッダーを優先）
  return typeof args['token'] === 'string' && args['token'] ? args['token'] : null
}

export async function POST(req: Request, { params }: { params: Promise<{ method: string }> }) {
  const { method } = await params
  if (!isKnownWebApiMethod(method)) return NextResponse.json({ ok: false, error: 'unknown_method' })

  const args = await readArgs(req)
  if (!args) return NextResponse.json({ ok: false, error: 'invalid_form_data' })

  try {
    const bot = await verifyBotToken(bearerToken(req, args))
    // 本文の token はメソッドの引数として渡さない
    const rest = { ...args }
    delete rest['token']
    return NextResponse.json(await dispatchWebApi(method, bot, rest))
  } catch (err) {
    if (err instanceof BotAuthError) {
      // 呼び出し回数の超過だけは Slack と同じく 429 と Retry-After を返す（Bolt が待って再試行する）
      if (err.code === 'ratelimited') {
        return NextResponse.json({ ok: false, error: 'ratelimited' }, { status: 429, headers: { 'Retry-After': '60' } })
      }
      return NextResponse.json({ ok: false, error: err.code })
    }
    console.error(`[/api/app-api/${method}] failed:`, err)
    return NextResponse.json({ ok: false, error: 'internal_error' })
  }
}
