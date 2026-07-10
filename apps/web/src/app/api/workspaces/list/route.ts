// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/get-auth-context'

export interface WorkspaceListItemDto {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  role: 'owner' | 'admin' | 'member' | 'guest'
}

export async function GET() {
  const { userId, error } = await getAuthUser()
  if (error) return error

  try {
    const { db, workspaces, activeWorkspaceMembers } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    // 非活性化された WS は一覧に出さない（当該 WS を未所属として扱う）
    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        logoUrl: workspaces.logoUrl,
        role: activeWorkspaceMembers.role,
      })
      .from(activeWorkspaceMembers)
      .innerJoin(workspaces, eq(activeWorkspaceMembers.workspaceId, workspaces.id))
      .where(eq(activeWorkspaceMembers.userId, userId))
      .orderBy(activeWorkspaceMembers.joinedAt)

    return NextResponse.json(rows satisfies WorkspaceListItemDto[])
  } catch (err) {
    console.error('[GET /api/workspaces/list]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
