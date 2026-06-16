// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

function detectMobile(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
}

export async function middleware(request: NextRequest) {
  const ua = request.headers.get('user-agent') ?? ''
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-device', detectMobile(ua) ? 'mobile' : 'desktop')

  const isWebView = request.nextUrl.searchParams.get('webview') === '1'
  if (isWebView) requestHeaders.set('x-webview', '1')

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

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/auth')
  // トップ（/）は公開 LP。next.config の rewrite で public/lp/index.html を配信する
  const isLandingRoute = pathname === '/'
  // 旧 LP の人間向け入口 URL。CSS/JS（/lp/*.css|js）はリダイレクト対象に含めない
  const isLegacyLpEntry =
    pathname === '/lp' || pathname === '/lp/' || pathname === '/lp/index.html'
  // 未ログインでもアクセスできるパブリックルート
  const isPublicRoute =
    pathname.startsWith('/invite') || pathname.startsWith('/lp') || isLandingRoute
  // オンボーディングはログイン済みユーザーが /auth/* にリダイレクトされないよう除外
  const isOnboardingRoute = pathname.startsWith('/onboarding')

  // 旧 /lp の入口は公開 LP を /（トップ）に集約するため恒久リダイレクト
  if (isLegacyLpEntry) {
    return NextResponse.redirect(new URL('/', request.url), 308)
  }

  if (!user && !isAuthRoute && !isPublicRoute) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
  // 認証済みユーザーはトップの LP ではなくアプリ本体へ誘導する
  if (user && isLandingRoute) {
    return NextResponse.redirect(new URL('/projects', request.url))
  }
  if (user && isAuthRoute && !isOnboardingRoute) {
    return NextResponse.redirect(new URL('/projects', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|.*\\.webmanifest|api/).*)'],
}
