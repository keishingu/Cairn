// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Expo } from 'expo-server-sdk'
import { getAuthContext } from '@/lib/get-auth-context'

const webSchema = z.object({
  deviceType: z.literal('web'),
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
})

const expoSchema = z.object({
  deviceType: z.literal('expo'),
  // SDK は角括弧内が空でも受理するため、空白だけの本体も登録前に拒否する。
  expoToken: z.string().refine(
    (token) => Expo.isExpoPushToken(token) && !/^Expo(nent)?PushToken\[\s*\]$/.test(token),
    { message: 'Invalid Expo push token' },
  ),
})

const subscribeSchema = z.discriminatedUnion('deviceType', [webSchema, expoSchema])

// Web は従来どおり endpoint だけを送る。アプリはこの端末のトークンで、アプリでオフにした分だけ外す
const unsubscribeSchema = z.union([
  z.object({ deviceType: z.literal('expo'), expoToken: z.string().min(1) }),
  z.object({ endpoint: z.string() }),
])

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

  const parsed = unsubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'endpoint or expoToken required' }, { status: 422 })
  }

  try {
    const { db, pushSubscriptions } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    const target = 'expoToken' in parsed.data
      ? eq(pushSubscriptions.expoToken, parsed.data.expoToken)
      : eq(pushSubscriptions.endpoint, parsed.data.endpoint)
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, ctx.userId), target))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/push/subscribe]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
