// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'

const webSchema = z.object({
  deviceType: z.literal('web'),
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
})

const expoSchema = z.object({
  deviceType: z.literal('expo'),
  expoToken: z.string().startsWith('ExponentPushToken['),
})

const subscribeSchema = z.discriminatedUnion('deviceType', [webSchema, expoSchema])

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = subscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const { db, pushSubscriptions } = await import('@cairn/db')

    if (parsed.data.deviceType === 'web') {
      await db
        .insert(pushSubscriptions)
        .values({
          userId: ctx.userId,
          deviceType: 'web',
          endpoint: parsed.data.endpoint,
          keys: parsed.data.keys,
        })
        .onConflictDoUpdate({
          target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
          set: { keys: parsed.data.keys },
        })
    } else {
      await db
        .insert(pushSubscriptions)
        .values({
          userId: ctx.userId,
          deviceType: 'expo',
          expoToken: parsed.data.expoToken,
        })
        .onConflictDoNothing()
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/push/subscribe]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = z.object({ endpoint: z.string() }).safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'endpoint required' }, { status: 422 })
  }

  try {
    const { db, pushSubscriptions } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, ctx.userId), eq(pushSubscriptions.endpoint, parsed.data.endpoint)))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/push/subscribe]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
