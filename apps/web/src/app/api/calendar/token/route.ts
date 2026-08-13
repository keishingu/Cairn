// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

function generateToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db } = await import('@cairn/db')
    const { profiles } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const [row] = await db
      .select({ icalToken: profiles.icalToken })
      .from(profiles)
      .where(eq(profiles.id, ctx.userId))

    if (row?.icalToken) {
      return NextResponse.json({ token: row.icalToken })
    }

    const token = generateToken()
    await db
      .update(profiles)
      .set({ icalToken: token })
      .where(eq(profiles.id, ctx.userId))

    return NextResponse.json({ token })
  } catch (err) {
    console.error('[/api/calendar/token GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db } = await import('@cairn/db')
    const { profiles } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const token = generateToken()
    await db
      .update(profiles)
      .set({ icalToken: token })
      .where(eq(profiles.id, ctx.userId))

    return NextResponse.json({ token })
  } catch (err) {
    console.error('[/api/calendar/token POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
