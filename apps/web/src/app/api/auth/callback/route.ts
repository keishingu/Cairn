// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  classifyLoginLinkError,
  parseLoginLinkContext,
} from '@/lib/auth-identity-link-errors'

function buildLoginLinkErrorRedirect(
  origin: string,
  provider: string | null,
  errorCode: string | null,
  errorDescription: string | null,
) {
  const url = new URL('/settings/account', origin)
  url.searchParams.set(
    'loginLinkError',
    classifyLoginLinkError(errorCode, errorDescription),
  )
  if (provider) url.searchParams.set('loginLinkProvider', provider)
  return url
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const oauthError = searchParams.get('error')
  const oauthErrorCode = searchParams.get('error_code')
  const oauthErrorDescription = searchParams.get('error_description')
  // 招待トークンが付いている場合は受け入れフローへ
  const inviteToken = searchParams.get('invite')
  const nextPath = searchParams.get('next')
  const safeNextPath = nextPath?.startsWith('/') && !nextPath.startsWith('//') ? nextPath : null
  const { isLoginLinkFlow, provider: loginLinkProvider } = parseLoginLinkContext(safeNextPath)

  // linkIdentity 失敗時は code ではなく error_* で戻る。設定画面へ日本語エラーを返す。
  if (oauthError || oauthErrorCode || oauthErrorDescription) {
    if (isLoginLinkFlow) {
      return NextResponse.redirect(
        buildLoginLinkErrorRedirect(
          origin,
          loginLinkProvider,
          oauthErrorCode,
          oauthErrorDescription,
        ),
      )
    }
    const loginUrl = new URL('/auth/login', origin)
    loginUrl.searchParams.set('error', 'callback')
    if (inviteToken) loginUrl.searchParams.set('invite', inviteToken)
    if (safeNextPath) loginUrl.searchParams.set('next', safeNextPath)
    return NextResponse.redirect(loginUrl)
  }

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      if (isLoginLinkFlow) {
        return NextResponse.redirect(
          buildLoginLinkErrorRedirect(
            origin,
            loginLinkProvider,
            error.code ?? null,
            error.message ?? null,
          ),
        )
      }
    } else if (data.user) {
      const user = data.user
      const displayName =
        (user.user_metadata?.['display_name'] as string | undefined) ??
        (user.user_metadata?.['full_name'] as string | undefined) ??
        (user.user_metadata?.['name'] as string | undefined) ??
        user.email ??
        'ユーザー'

      let isNewUser = true

      if (process.env['DATABASE_URL']) {
        try {
          const { db } = await import('@cairn/db')
          const { profiles } = await import('@cairn/db')
          const { eq } = await import('drizzle-orm')

          const existing = await db
            .select({ id: profiles.id })
            .from(profiles)
            .where(eq(profiles.id, user.id))
            .limit(1)

          isNewUser = existing.length === 0

          if (isNewUser) {
            await db.insert(profiles).values({ id: user.id, displayName })
          }
        } catch (err) {
          console.error('[/api/auth/callback] setup failed:', err)
        }
      }

      if (inviteToken) {
        return NextResponse.redirect(`${origin}/invite/${inviteToken}`)
      }
      if (isNewUser) {
        return NextResponse.redirect(`${origin}/onboarding`)
      }
      if (safeNextPath) {
        return NextResponse.redirect(`${origin}${safeNextPath}`)
      }
      return NextResponse.redirect(`${origin}/chats`)
    }
  }

  if (isLoginLinkFlow) {
    return NextResponse.redirect(
      buildLoginLinkErrorRedirect(origin, loginLinkProvider, null, null),
    )
  }

  const loginUrl = new URL('/auth/login', origin)
  loginUrl.searchParams.set('error', 'callback')
  if (inviteToken) loginUrl.searchParams.set('invite', inviteToken)
  if (safeNextPath) loginUrl.searchParams.set('next', safeNextPath)
  return NextResponse.redirect(loginUrl)
}
