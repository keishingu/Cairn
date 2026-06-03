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

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json([
      { id: '10000000-0000-0000-0000-000000000001', name: 'Dev Workspace', slug: 'dev', logoUrl: null, role: 'owner' },
    ] satisfies WorkspaceListItemDto[])
  }

  try {
    const { db, workspaces, workspaceMembers } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        logoUrl: workspaces.logoUrl,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(workspaceMembers.joinedAt)

    return NextResponse.json(rows satisfies WorkspaceListItemDto[])
  } catch (err) {
    console.error('[GET /api/workspaces/list]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
