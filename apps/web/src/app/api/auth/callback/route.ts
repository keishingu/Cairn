// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // 招待トークンが付いている場合は受け入れフローへ
  const inviteToken = searchParams.get('invite')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
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
      return NextResponse.redirect(`${origin}/projects`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=callback`)
}
