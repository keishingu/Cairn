// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { token } = await params

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ ok: true })
  }

  try {
    const { db } = await import('@cairn/db')
    const { workspaceInvites } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    await db
      .delete(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.token, token),
          eq(workspaceInvites.workspaceId, ctx.workspaceId),
        )
      )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/workspaces/invites/[token]] DELETE failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
