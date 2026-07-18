// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'

// タブ復帰時にクライアントから叩く軽量ウォームアップ。
// 目的は「放置後の初回遷移だけ遅い」の主因である、サーバーレス関数の
// コールドスタートと DB 接続確立（packages/db は max:1）を、ユーザーが
// 実際に操作する前に先行して温めること。詳細は docs/performance-improvement-plan.md §2.3。
//
// 認証は敢えて要求しない。Auth 往復（同ドキュメント §2.1）自体が温めたい固定費であり、
// ここで認証を挟むと目的に反するため。処理は select 1 のみで副作用を持たない。
//
// ただし認証なし・予測可能な公開 GET のため、外部からの連打で DB 接続（max:1）を
// 消費されないよう Sec-Fetch-Site で同一オリジンの fetch のみを許可する。
// このヘッダはブラウザが fetch() 発行時に自動付与し偽装コストが低くないため、
// 秘密情報なしで crawler・直接アクセスを弾く軽量ガードとして機能する
// （FocusWarmup からの同一オリジン fetch は 'same-origin' になる）。
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  if (request.headers.get('sec-fetch-site') !== 'same-origin') {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { sql } = await import('drizzle-orm')
    await db.execute(sql`select 1`)
  } catch {
    // ウォームアップは best-effort。DB ping 失敗でも 200 を返し、クライアントを煩わせない
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
