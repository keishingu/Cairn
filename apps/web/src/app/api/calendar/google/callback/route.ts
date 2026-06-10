// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { exchangeCodeForTokens, listCalendars } from '@/lib/google-calendar-api'
import { encryptToken } from '@/lib/token-crypto'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')

  const origin = req.nextUrl.origin
  const settingsUrl = `${origin}/settings?tab=integrations`

  if (oauthError) {
    return NextResponse.redirect(`${settingsUrl}&gcal=denied`)
  }

  // CSRF 検証
  const storedState = req.cookies.get('gcal_oauth_state')?.value
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${settingsUrl}&gcal=error`)
  }

  if (!code) {
    return NextResponse.redirect(`${settingsUrl}&gcal=error`)
  }

  const { ctx, error } = await getAuthContext()
  if (error) return NextResponse.redirect(`${origin}/auth/login`)

  try {
    const { accessToken, refreshToken, expiresIn, email } = await exchangeCodeForTokens(code)

    // 接続後にすべてのカレンダーを取得し、selectedCalendars の初期値に使う
    const calendars = await listCalendars(accessToken)
    const selectedCalendars = calendars.map(c => ({
      id: c.id,
      name: c.summary,
      color: c.backgroundColor ?? '#039BE5',
    }))

    const expiresAt = new Date(Date.now() + expiresIn * 1000)
    const meta = { googleAccountEmail: email, selectedCalendars }

    const { db, connectedAccounts } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    // 既存レコードがあれば更新、なければ挿入
    const [existing] = await db
      .select({ id: connectedAccounts.id })
      .from(connectedAccounts)
      .where(and(
        eq(connectedAccounts.userId, ctx.userId),
        eq(connectedAccounts.provider, 'google_calendar'),
      ))
      .limit(1)

    if (existing) {
      await db.update(connectedAccounts)
        .set({
          accessTokenEncrypted: encryptToken(accessToken),
          refreshTokenEncrypted: encryptToken(refreshToken),
          expiresAt,
          providerAccountId: email,
          metadata: meta,
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, existing.id))
    } else {
      await db.insert(connectedAccounts).values({
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        provider: 'google_calendar',
        providerAccountId: email,
        accessTokenEncrypted: encryptToken(accessToken),
        refreshTokenEncrypted: encryptToken(refreshToken),
        expiresAt,
        metadata: meta,
      })
    }

    const res = NextResponse.redirect(`${settingsUrl}&gcal=connected`)
    res.cookies.delete('gcal_oauth_state')
    return res
  } catch (err) {
    console.error('[/api/calendar/google/callback]', err)
    return NextResponse.redirect(`${settingsUrl}&gcal=error`)
  }
}
