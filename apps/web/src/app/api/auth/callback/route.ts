// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lockAccountLifecycle } from '@/lib/access/account-lifecycle-lock'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // 招待トークンが付いている場合は受け入れフローへ
  const inviteToken = searchParams.get('invite')
  const nextPath = searchParams.get('next')
  const safeNextPath = nextPath?.startsWith('/') && !nextPath.startsWith('//') ? nextPath : null

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

          isNewUser = await db.transaction(async (tx) => {
            const state = await lockAccountLifecycle(tx, user.id)
            if (state === 'deleting') return false
            if (state === 'usable') return false
            const { sql } = await import('drizzle-orm')
            await tx.execute(sql`
              insert into profiles (id, display_name)
              values (${user.id}, ${displayName})
              on conflict (id) do nothing
            `)
            return true
          })
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
      return NextResponse.redirect(`${origin}/projects`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=callback`)
}
