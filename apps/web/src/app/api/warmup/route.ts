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
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const { db } = await import('@cairn/db')
    const { sql } = await import('drizzle-orm')
    await db.execute(sql`select 1`)
  } catch {
    // ウォームアップは best-effort。DB ping 失敗でも 200 を返し、クライアントを煩わせない
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
