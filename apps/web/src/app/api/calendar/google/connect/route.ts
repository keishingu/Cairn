// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { buildOAuthUrl } from '@/lib/google-calendar-api'
import { enforceFixedWindowRateLimit } from '@/lib/request-rate-limit'

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const rateLimited = await enforceFixedWindowRateLimit({
    key: `google-calendar-connect:${ctx.userId}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
    prefix: '@cairn/google-calendar-connect',
  })
  if (rateLimited) return rateLimited

  if (!process.env['GOOGLE_CALENDAR_CLIENT_ID'] || !process.env['GOOGLE_CALENDAR_REDIRECT_URI']) {
    return NextResponse.json({ error: 'Google Calendar integration is not configured' }, { status: 503 })
  }

  const state = crypto.randomUUID()
  const url = buildOAuthUrl(state)

  const res = NextResponse.json({ url })
  res.cookies.set('gcal_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
