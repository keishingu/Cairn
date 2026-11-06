// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { fetchWithRetryableAuthRefresh, resolveLocale, translate } from '@cairn/shared'
import { verifyAccessToken } from '@/lib/auth-jwt'

function detectMobile(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
}

export async function middleware(request: NextRequest) {
  const ua = request.headers.get('user-agent') ?? ''
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-device', detectMobile(ua) ? 'mobile' : 'desktop')

  const isWebView = request.nextUrl.searchParams.get('webview') === '1'
  const persistedWebView = request.cookies.get('cairn-webview')?.value === '1'
  if (isWebView || persistedWebView) requestHeaders.set('x-webview', '1')

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const supabasePublishableKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']!

  const authCookies = new Map<string, { name: string; value: string; options: CookieOptions }>()

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    global: { fetch: fetchWithRetryableAuthRefresh },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value)
          authCookies.set(cookie.name, cookie)
        }
        requestHeaders.set('cookie', request.cookies.toString())
        supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
      },
    },
  })

  // getClaims で JWT をローカル検証する（非対称署名鍵なら Auth API 往復なし）。
  // 更新失敗とセッション失効を区別するため getSession のエラーも確認する。
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  const userId = session ? await verifyAccessToken(supabase.auth, session.access_token) : null
  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/auth')
  const isMobileHandoffRoute = pathname === '/auth/mobile-handoff'
  const isMobileSignoutRoute =
    pathname === '/auth/mobile-signout' || pathname === '/auth/mobile-device-signout'
  // トップページは未ログインでも閲覧できる公開 LP
  const isLandingRoute = pathname === '/'
  const isLandingAsset =
    pathname === '/cairn-lp.css' ||
    pathname === '/cairn-lp.js' ||
    pathname === '/og-image.png' ||
    pathname === '/og-image.svg' ||
    pathname.startsWith('/badges/')
  const isSeoRoute = pathname === '/robots.txt' || pathname === '/sitemap.xml'
  const isLegalRoute = pathname === '/privacy' || pathname === '/terms'
  // Teams コミュニティからの移行の案内（広告の遷移先なのでログインを求めない）
  const isCampaignRoute = pathname === '/teams/migration'
  // アプリ開発者向けの公開ドキュメント
  const isDevelopersRoute = pathname === '/developers' || pathname.startsWith('/developers/')
  // 未ログインでもアクセスできるパブリックルート（LP と関連静的アセットを含む）
  const isPublicRoute =
    pathname.startsWith('/invite') ||
    pathname.startsWith('/.well-known/') ||
    // 「Cairn でログイン」のディスカバリーと公開鍵（外部アプリがログインなしで取得する）
    pathname.startsWith('/oidc/.well-known/') ||
    pathname === '/oidc/jwks.json' ||
    isLandingRoute ||
    isLandingAsset ||
    isLegalRoute ||
    isCampaignRoute ||
    isDevelopersRoute ||
    isSeoRoute
  // オンボーディングはログイン済みユーザーが /auth/* にリダイレクトされないよう除外
  const isOnboardingRoute = pathname.startsWith('/onboarding')

  function withCookies(response: NextResponse) {
    for (const { name, value, options } of authCookies.values()) {
      response.cookies.set(name, value, options)
    }
    if (authCookies.size) response.headers.set('Cache-Control', 'private, no-store')
    if (isWebView) {
      response.cookies.set('cairn-webview', '1', {
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
        path: '/',
      })
    }
    return response
  }

  if (!userId && !isAuthRoute && !isPublicRoute) {
    if (isAuthRetryableFetchError(sessionError)) {
      const locale = resolveLocale('system', request.headers.get('accept-language'))
      return withCookies(new NextResponse(translate(locale, 'Could not connect. Try again.'), {
        status: 503,
        headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain; charset=utf-8' },
      }))
    }
    const loginUrl = new URL('/auth/login', request.url)
    // MCP の認可（/oauth/authorize）と「Cairn でログイン」の同意画面（/oidc/authorize）は、
    // ログイン後に同じ画面へ戻す
    if (pathname === '/oauth/authorize' || pathname === '/oidc/authorize') {
      loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`)
    }
    return withCookies(NextResponse.redirect(loginUrl))
  }
  if (userId && isLandingRoute) {
    return withCookies(NextResponse.redirect(new URL('/chats', request.url)))
  }
  if (
    userId &&
    isAuthRoute &&
    !isOnboardingRoute &&
    !isMobileHandoffRoute &&
    !isMobileSignoutRoute
  ) {
    return withCookies(NextResponse.redirect(new URL('/chats', request.url)))
  }

  return withCookies(supabaseResponse)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|.*\\.webmanifest|api/).*)'],
}
