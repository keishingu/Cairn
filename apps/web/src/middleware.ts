// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

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
          supabaseResponse = NextResponse.next({ request })
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

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
