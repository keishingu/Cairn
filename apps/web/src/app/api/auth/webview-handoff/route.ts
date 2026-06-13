// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// モバイル WebView 認証ハンドオフ用のワンタイムトークン発行エンドポイント。
// ネイティブの強いトークン（refresh_token）を WebView に渡すと、
// 同一 refresh_token を 2 クライアントが共有して rotation と衝突し、
// セッションが突然失効する（docs/mobile-webview-auth-handoff.md）。
// ここでは認証済みユーザー自身の magiclink を発行し、使い捨ての
// hashed_token だけを返す。WebView 側は verifyOtp で独立したセッションを確立する。

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServiceRoleClient } from '@/lib/supabase/service'

export async function POST() {
  const { ctx, error } = await getAuthContext()
  if (error) return error // 未認証なら 401

  const admin = createServiceRoleClient()

  // email はリクエストから受け取らず、認証済みユーザー自身のものをサーバー側で取得する。
  // 任意 email を指定する入力経路を作ると他人のリンクを発行できてしまうため。
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(ctx.userId)
  const email = userData?.user?.email
  if (userError || !email) {
    console.error('[webview-handoff] ユーザーの email 取得に失敗:', userError)
    return NextResponse.json({ error: 'Failed to resolve user' }, { status: 500 })
  }

  // generateLink はメールを送信せず、リンク（hashed_token）を返すだけ。
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const tokenHash = linkData?.properties?.hashed_token
  if (linkError || !tokenHash) {
    console.error('[webview-handoff] magiclink の発行に失敗:', linkError)
    return NextResponse.json({ error: 'Failed to generate handoff token' }, { status: 500 })
  }

  return NextResponse.json({ tokenHash })
}
