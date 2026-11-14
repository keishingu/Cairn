// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'

const schema = z.object({ userId: z.string().uuid() })

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const { db, profiles, userBlocks, workspaceMembers } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const rows = await db.select({ userId: profiles.id, displayName: profiles.displayName, avatarUrl: workspaceMembers.avatarUrl, createdAt: userBlocks.createdAt })
    .from(userBlocks).innerJoin(profiles, eq(profiles.id, userBlocks.blockedId))
    .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
    .where(eq(userBlocks.blockerId, ctx.userId)).orderBy(userBlocks.createdAt)
  return NextResponse.json(rows.map(row => ({ ...row, avatarUrl: row.avatarUrl ?? null, createdAt: row.createdAt.toISOString() })))
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  if (parsed.data.userId === ctx.userId) return NextResponse.json({ error: '自分自身はブロックできません' }, { status: 422 })
  const { db, activeWorkspaceMembers, userBlocks } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [member] = await db.select({ userId: activeWorkspaceMembers.userId }).from(activeWorkspaceMembers)
    .where(and(eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId), eq(activeWorkspaceMembers.userId, parsed.data.userId))).limit(1)
  if (!member) return NextResponse.json({ error: '指定されたユーザーはワークスペースのメンバーではありません' }, { status: 422 })
  await db.insert(userBlocks).values({ blockerId: ctx.userId, blockedId: parsed.data.userId }).onConflictDoNothing()
  return NextResponse.json({ blocked: true }, { status: 201 })
}
