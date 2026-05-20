// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      const user = data.user
      const displayName =
        (user.user_metadata?.['display_name'] as string | undefined) ??
        user.email ??
        'ユーザー'

      if (process.env['DATABASE_URL']) {
        try {
          const { db } = await import('@cairn/db')
          const { profiles, workspaces, workspaceMembers, channels } = await import('@cairn/db')
          const { eq } = await import('drizzle-orm')

          const existing = await db
            .select({ id: profiles.id })
            .from(profiles)
            .where(eq(profiles.id, user.id))
            .limit(1)

          if (existing.length === 0) {
            await db.insert(profiles).values({ id: user.id, displayName })

            const slug = `workspace-${user.id.slice(0, 8)}`
            const [ws] = await db
              .insert(workspaces)
              .values({ name: `${displayName}のワークスペース`, slug, createdBy: user.id })
              .returning({ id: workspaces.id })

            if (ws) {
              await db.insert(workspaceMembers).values({
                workspaceId: ws.id,
                userId: user.id,
                role: 'owner',
              })
              await db.insert(channels).values([
                { workspaceId: ws.id, name: '雑談', isPrivate: false },
                { workspaceId: ws.id, name: '連絡事項', isPrivate: false },
              ])
            }
          }
        } catch (err) {
          console.error('[/api/auth/callback] setup failed:', err)
        }
      }

      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=callback`)
}
