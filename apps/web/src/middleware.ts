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
  // トップページは未ログインでも閲覧できる公開 LP
  const isLandingRoute = pathname === '/'
  // 旧 LP と静的 HTML の直 URL。公開 LP は / に集約するためリダイレクトする
  const isLegacyLpPage = pathname === '/lp' || pathname === '/lp/' || pathname === '/lp/index.html' || pathname === '/index.html'
  const isSeoRoute = pathname === '/robots.txt' || pathname === '/sitemap.xml'
  // 未ログインでもアクセスできるパブリックルート（/lp/ 配下の静的アセットも含む）
  const isPublicRoute = pathname.startsWith('/invite') || pathname.startsWith('/lp') || isLandingRoute || isLegacyLpPage || isSeoRoute
  // オンボーディングはログイン済みユーザーが /auth/* にリダイレクトされないよう除外
  const isOnboardingRoute = pathname.startsWith('/onboarding')

  if (!user && !isAuthRoute && !isPublicRoute) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
  if (isLegacyLpPage) {
    const landingUrl = new URL('/', request.url)
    landingUrl.search = request.nextUrl.search
    return NextResponse.redirect(landingUrl)
  }
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
