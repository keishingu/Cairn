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

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
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
    },
  )

  // 認証実装前は全ルートをパブリックとして扱う
  // TODO: 認証実装後に下記を有効化する
  // const { data: { user } } = await supabase.auth.getUser()
  // const isAuthRoute = request.nextUrl.pathname.startsWith('/auth')
  // const isPublicRoute = request.nextUrl.pathname === '/'
  // if (!user && !isAuthRoute && !isPublicRoute) {
  //   return NextResponse.redirect(new URL('/auth/login', request.url))
  // }
  // if (user && isAuthRoute) {
  //   return NextResponse.redirect(new URL('/dashboard', request.url))
  // }

  void supabase

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
