// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
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

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        )
      },
    },
  })

  // getClaims で JWT をローカル検証する（非対称署名鍵なら Auth API 往復なし）。
  // getSession 経由で期限切れセッションのリフレッシュ副作用（Cookie 再発行）も維持される。
  const userId = await verifyAccessToken(supabase.auth)
  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/auth')
  const isMobileHandoffRoute = pathname === '/auth/mobile-handoff'
  const isMobileSignoutRoute = pathname === '/auth/mobile-signout'
  // トップページは未ログインでも閲覧できる公開 LP
  const isLandingRoute = pathname === '/'
  const isLandingAsset =
    pathname === '/cairn-lp.css' ||
    pathname === '/cairn-lp.js' ||
    pathname === '/og-image.png' ||
    pathname === '/og-image.svg'
  const isSeoRoute = pathname === '/robots.txt' || pathname === '/sitemap.xml'
  // 未ログインでもアクセスできるパブリックルート（LP と関連静的アセットを含む）
  const isPublicRoute = pathname.startsWith('/invite') || isLandingRoute || isLandingAsset || isSeoRoute
  // オンボーディングはログイン済みユーザーが /auth/* にリダイレクトされないよう除外
  const isOnboardingRoute = pathname.startsWith('/onboarding')

  if (!userId && !isAuthRoute && !isPublicRoute) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
  if (userId && isLandingRoute) {
    return NextResponse.redirect(new URL('/projects', request.url))
  }
  if (userId && isAuthRoute && !isOnboardingRoute && !isMobileHandoffRoute && !isMobileSignoutRoute) {
    return NextResponse.redirect(new URL('/projects', request.url))
  }

  if (isWebView) {
    supabaseResponse.cookies.set('cairn-webview', '1', {
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
    })
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|.*\\.webmanifest|api/).*)'],
}
