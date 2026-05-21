// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/middleware'

function detectMobile(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
}

export async function middleware(request: NextRequest) {
  const ua = request.headers.get('user-agent') ?? ''
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-device', detectMobile(ua) ? 'mobile' : 'desktop')

  const supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const supabaseKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']

  // Supabase 環境変数が揃っているときのみ認証チェックを行う
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(request, supabaseResponse)

    const { data: { user } } = await supabase.auth.getUser()
    const { pathname } = request.nextUrl
    const isAuthRoute = pathname.startsWith('/auth')

    if (!user && !isAuthRoute) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
    if (user && isAuthRoute) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
