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
    const { db, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, and, sql } = await import('drizzle-orm')

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`
        select 1
        from workspace_members
        where workspace_id = ${ctx.workspaceId}
          and user_id = ${ctx.userId}
          and membership_status = 'active'
        for update
      `)

      const [activeMember] = await tx
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(
          eq(workspaceMembers.userId, ctx.userId),
          eq(workspaceMembers.workspaceId, ctx.workspaceId),
          eq(workspaceMembers.membershipStatus, 'active'),
        ))
        .limit(1)

      if (!activeMember) {
        return { ok: false as const }
      }

      const [row] = await tx
        .select({ icalToken: profiles.icalToken })
        .from(profiles)
        .where(eq(profiles.id, ctx.userId))

      if (row?.icalToken) {
        return { ok: true as const, token: row.icalToken }
      }

      const token = generateToken()
      await tx
        .update(profiles)
        .set({ icalToken: token })
        .where(eq(profiles.id, ctx.userId))

      return { ok: true as const, token }
    })

    if (!result.ok) {
      return NextResponse.json({ error: '非アクティブなメンバーはカレンダートークンを取得できません' }, { status: 409 })
    }

    return NextResponse.json({ token: result.token })
  } catch (err) {
    console.error('[/api/calendar/token GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, and, sql } = await import('drizzle-orm')

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`
        select 1
        from workspace_members
        where workspace_id = ${ctx.workspaceId}
          and user_id = ${ctx.userId}
          and membership_status = 'active'
        for update
      `)

      const [activeMember] = await tx
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(
          eq(workspaceMembers.userId, ctx.userId),
          eq(workspaceMembers.workspaceId, ctx.workspaceId),
          eq(workspaceMembers.membershipStatus, 'active'),
        ))
        .limit(1)

      if (!activeMember) {
        return { ok: false as const }
      }

      const token = generateToken()
      await tx
        .update(profiles)
        .set({ icalToken: token })
        .where(eq(profiles.id, ctx.userId))

      return { ok: true as const, token }
    })

    if (!result.ok) {
      return NextResponse.json({ error: '非アクティブなメンバーはカレンダートークンを更新できません' }, { status: 409 })
    }

    return NextResponse.json({ token: result.token })
  } catch (err) {
    console.error('[/api/calendar/token POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
