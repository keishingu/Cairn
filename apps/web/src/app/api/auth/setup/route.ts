// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const setupSchema = z.object({
  displayName: z.string().min(1).max(100),
})

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = setupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ ok: true })
  }

  try {
    const { db } = await import('@cairn/db')
    const { profiles, workspaces, workspaceMembers, channels } = await import('@cairn/db')
    const serviceClient = await createServiceClient()

    // createServiceClient is used to bypass RLS for initial profile creation
    void serviceClient

    const existing = await db.select({ id: profiles.id }).from(profiles).where(
      (await import('drizzle-orm')).eq(profiles.id, user.id)
    ).limit(1)

    if (existing.length === 0) {
      await db.insert(profiles).values({
        id: user.id,
        displayName: parsed.data.displayName,
      })
    }

    const { eq } = await import('drizzle-orm')

    const existingMembership = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user.id))
      .limit(1)

    if (existingMembership.length === 0) {
      // 既存ワークスペースがあれば参加、なければ新規作成
      const anyWorkspace = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .limit(1)

      let workspaceId: string

      if (anyWorkspace.length > 0) {
        workspaceId = anyWorkspace[0]!.id
      } else {
        const [ws] = await db
          .insert(workspaces)
          .values({ name: '山岳部', slug: 'sangakubu', createdBy: user.id })
          .returning({ id: workspaces.id })
        if (!ws) throw new Error('workspace insert failed')
        workspaceId = ws.id

        await db.insert(channels).values([
          { workspaceId, type: 'workspace' as const, name: '雑談' },
          { workspaceId, type: 'workspace' as const, name: '連絡事項' },
        ])
      }

      await db.insert(workspaceMembers).values({
        workspaceId,
        userId: user.id,
        role: 'member',
      })

      const { inngest } = await import('@/lib/inngest/client')
      await inngest.send({
        name: 'member/upserted',
        data: { userId: user.id, workspaceId },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/auth/setup] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
