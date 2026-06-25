// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

export interface GoogleCalendarListItem {
  id: string
  summary: string
  backgroundColor?: string
  primary?: boolean
  accessRole: string
}

export interface GoogleCalendarEvent {
  id: string
  summary?: string
  description?: string
  htmlLink: string
  status: string
  start: { date?: string; dateTime?: string }
  end: { date?: string; dateTime?: string }
}

export function buildOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env['GOOGLE_CALENDAR_CLIENT_ID']!,
    redirect_uri: process.env['GOOGLE_CALENDAR_REDIRECT_URI']!,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
  email: string
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env['GOOGLE_CALENDAR_CLIENT_ID']!,
      client_secret: process.env['GOOGLE_CALENDAR_CLIENT_SECRET']!,
      redirect_uri: process.env['GOOGLE_CALENDAR_REDIRECT_URI']!,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  })
  if (!userRes.ok) throw new Error('Failed to fetch Google user info')
  const user = await userRes.json() as { email: string }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    email: user.email,
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string
  expiresIn: number
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env['GOOGLE_CALENDAR_CLIENT_ID']!,
      client_secret: process.env['GOOGLE_CALENDAR_CLIENT_SECRET']!,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  const data = await res.json() as { access_token: string; expires_in: number }
  return { accessToken: data.access_token, expiresIn: data.expires_in }
}

export function isGoogleInvalidGrantError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('"error": "invalid_grant"')
}

export async function listCalendars(accessToken: string): Promise<GoogleCalendarListItem[]> {
  const res = await fetch(`${GOOGLE_CALENDAR_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch calendar list: ${res.status} ${await res.text()}`)
  const data = await res.json() as { items?: GoogleCalendarListItem[] }
  return data.items ?? []
}

export async function listEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })
  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`Failed to fetch events for ${calendarId}`)
  const data = await res.json() as { items?: GoogleCalendarEvent[] }
  return (data.items ?? []).filter(e => e.status !== 'cancelled')
}
