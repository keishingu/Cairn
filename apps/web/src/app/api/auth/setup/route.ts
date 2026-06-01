// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const setupSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  workspaceName: z.string().min(1).max(100).optional(),
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
    return NextResponse.json({ ok: true, needsWorkspace: false })
  }

  try {
    const { db } = await import('@cairn/db')
    const { profiles, workspaces, workspaceMembers, channels } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const existing = await db.select({ id: profiles.id }).from(profiles).where(
      eq(profiles.id, user.id)
    ).limit(1)

    if (existing.length === 0) {
      const displayName =
        parsed.data.displayName ??
        (user.user_metadata?.['display_name'] as string | undefined) ??
        user.email ??
        'ユーザー'
      await db.insert(profiles).values({ id: user.id, displayName })
    }

    // workspaceName が指定されていれば必ず新規ワークスペースを作成（複数WS対応）
    // 指定がない場合のみ既存メンバーシップを確認してオンボーディング要否を返す
    if (!parsed.data.workspaceName) {
      const existingMembership = await db
        .select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, user.id))
        .limit(1)

      return NextResponse.json({
        ok: true,
        needsWorkspace: existingMembership.length === 0,
      })
    }

    const workspaceName = parsed.data.workspaceName
    const slug = `${workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${user.id.slice(0, 8)}`

    const [ws] = await db
      .insert(workspaces)
      .values({ name: workspaceName, slug, createdBy: user.id })
      .returning({ id: workspaces.id })
    if (!ws) throw new Error('workspace insert failed')

    await db.insert(channels).values([
      { workspaceId: ws.id, type: 'workspace' as const, name: '雑談' },
      { workspaceId: ws.id, type: 'workspace' as const, name: '連絡事項' },
    ])

    await db.insert(workspaceMembers).values({
      workspaceId: ws.id,
      userId: user.id,
      role: 'owner',
    })

    try {
      const { inngest } = await import('@/lib/inngest/client')
      await inngest.send({
        name: 'member/upserted',
        data: { userId: user.id, workspaceId: ws.id },
      })
    } catch (e) {
      console.warn('[/api/auth/setup] Inngest event send failed (indexing skipped):', e)
    }

    return NextResponse.json({ ok: true, needsWorkspace: false, workspaceId: ws.id })
  } catch (err) {
    console.error('[/api/auth/setup] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
