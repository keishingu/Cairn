// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'

const createInviteSchema = z.object({
  expiresIn: z.enum(['1h', '30d', 'never']).default('1h'),
  maxUses: z.number().int().positive().nullable().optional(),
  role: z.enum(['member', 'guest']).default('member'),
})

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createInviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const forbidden = requireRole(ctx.role, 'admin')
    if (forbidden) return forbidden

    const { db } = await import('@cairn/db')
    const { workspaceInvites } = await import('@cairn/db')
    const { randomUUID } = await import('crypto')

    const { expiresIn, maxUses, role } = parsed.data
    const token = randomUUID()

    let expiresAt: Date | null = null
    if (expiresIn === '1h') {
      expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    } else if (expiresIn === '30d') {
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }

    const [invite] = await db
      .insert(workspaceInvites)
      .values({
        workspaceId: ctx.workspaceId,
        token,
        createdBy: ctx.userId,
        expiresAt,
        maxUses: maxUses ?? null,
        role,
      })
      .returning()

    const origin = new URL(req.url).origin
    return NextResponse.json({
      token: invite!.token,
      url: `${origin}/invite/${invite!.token}`,
      expiresAt: invite!.expiresAt,
      role: invite!.role,
    })
  } catch (err) {
    console.error('[/api/workspaces/invites] POST failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = requireRole(ctx.role, 'admin')
  if (forbidden) return forbidden

  try {
    const { db } = await import('@cairn/db')
    const { workspaceInvites, profiles } = await import('@cairn/db')
    const { eq, and, or, isNull, gt } = await import('drizzle-orm')

    const now = new Date()
    const invites = await db
      .select({
        id: workspaceInvites.id,
        token: workspaceInvites.token,
        expiresAt: workspaceInvites.expiresAt,
        maxUses: workspaceInvites.maxUses,
        useCount: workspaceInvites.useCount,
        role: workspaceInvites.role,
        createdAt: workspaceInvites.createdAt,
        createdByName: profiles.displayName,
      })
      .from(workspaceInvites)
      .innerJoin(profiles, eq(workspaceInvites.createdBy, profiles.id))
      .where(
        and(
          eq(workspaceInvites.workspaceId, ctx.workspaceId),
          or(isNull(workspaceInvites.expiresAt), gt(workspaceInvites.expiresAt, now)),
        )
      )
      .orderBy(workspaceInvites.createdAt)

    const origin = new URL(req.url).origin
    return NextResponse.json({
      invites: invites.map(inv => ({
        ...inv,
        url: `${origin}/invite/${inv.token}`,
      })),
    })
  } catch (err) {
    console.error('[/api/workspaces/invites] GET failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
