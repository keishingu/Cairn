// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/get-auth-context'

// タブ復帰時にクライアントから叩く軽量ウォームアップ。
// 目的は「放置後の初回遷移だけ遅い」の主因である、サーバーレス関数の
// コールドスタートと DB 接続確立（packages/db は max:1）を、ユーザーが
// 実際に操作する前に先行して温めること。詳細は docs/performance-improvement-plan.md §2.3。
//
// 認証なし・予測可能な公開 GET だと、外部からの連打で DB 接続（max:1）を消費されうる
// （レビュー指摘: Sec-Fetch-Site はリクエストヘッダに過ぎずスクリプトから偽装できるため
// ガードにならないと判明し、最初の実装から差し替えた）。
// そのため getAuthUser() で Bearer トークン / Cookie セッションの正当性を検証し、
// 有効なログイン済みユーザーの呼び出しのみ DB に ping する。署名鍵移行（P1・#391）後は
// verifyAccessToken がローカル検証に切り替わり、この検証自体が Auth API 往復なしで
// 完了するようになる。処理は select 1 のみで副作用を持たない。
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const { error } = await getAuthUser()
  if (error) return error

  try {
    const { db } = await import('@cairn/db')
    const { sql } = await import('drizzle-orm')
    await db.execute(sql`select 1`)
  } catch {
    // ウォームアップは best-effort。DB ping 失敗でも 200 を返し、クライアントを煩わせない
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
