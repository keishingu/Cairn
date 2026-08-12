// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { lockAccountLifecycle } from '@/lib/access/account-lifecycle-lock'

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
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { workspaces, workspaceMembers, activeWorkspaceMembers, channels } =
      await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const displayName =
      parsed.data.displayName ??
      (user.user_metadata?.['display_name'] as string | undefined) ??
      user.email ??
      'ユーザー'

    const setup = await db.transaction(async (tx) => {
      const accountState = await lockAccountLifecycle(tx, user.id)
      if (accountState === 'deleting') return null
      if (accountState === 'missing') {
        const { sql } = await import('drizzle-orm')
        // migration前後のどちらでも動く既存カラムだけを明示する。
        await tx.execute(sql`
          insert into profiles (id, display_name)
          values (${user.id}, ${displayName})
          on conflict (id) do nothing
        `)
      }

      // workspaceName が指定されていれば必ず新規ワークスペースを作成（複数WS対応）
      // 指定がない場合のみ既存メンバーシップを確認してオンボーディング要否を返す
      if (!parsed.data.workspaceName) {
        const existingMembership = await tx
          .select({ workspaceId: activeWorkspaceMembers.workspaceId })
          .from(activeWorkspaceMembers)
          .where(eq(activeWorkspaceMembers.userId, user.id))
          .limit(1)
        return { needsWorkspace: existingMembership.length === 0, workspaceId: null }
      }

      const workspaceName = parsed.data.workspaceName
      const { randomUUID } = await import('crypto')
      const slug = `${workspaceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}-${randomUUID().slice(0, 8)}`

      const [ws] = await tx
        .insert(workspaces)
        .values({ name: workspaceName, slug, createdBy: user.id })
        .returning({ id: workspaces.id })
      if (!ws) throw new Error('workspace insert failed')

      await tx.insert(channels).values([
        { workspaceId: ws.id, type: 'workspace' as const, name: '雑談' },
        { workspaceId: ws.id, type: 'workspace' as const, name: '連絡事項' },
      ])

      const { projectStatuses } = await import('@cairn/db')
      await tx.insert(projectStatuses).values([
        { workspaceId: ws.id, name: '計画中', color: '#3B82F6', sortOrder: '1' },
        { workspaceId: ws.id, name: '審議中', color: '#F59E0B', sortOrder: '2' },
        { workspaceId: ws.id, name: '実施待ち', color: '#10B981', sortOrder: '3' },
        { workspaceId: ws.id, name: '実施中', color: '#8B5CF6', sortOrder: '4' },
        { workspaceId: ws.id, name: '振り返り中', color: '#F43F5E', sortOrder: '5' },
        { workspaceId: ws.id, name: '完了', color: '#6B7280', sortOrder: '6' },
      ])

      await tx.insert(workspaceMembers).values({
        workspaceId: ws.id,
        userId: user.id,
        role: 'owner',
      })
      return { needsWorkspace: false, workspaceId: ws.id }
    })

    if (!setup) {
      return NextResponse.json({ error: 'Account deletion is in progress' }, { status: 410 })
    }

    if (setup.workspaceId)
      try {
        const { inngest } = await import('@/lib/inngest/client')
        await inngest.send({
          name: 'member/upserted',
          data: { userId: user.id, workspaceId: setup.workspaceId },
        })
      } catch (e) {
        console.warn('[/api/auth/setup] Inngest event send failed (indexing skipped):', e)
      }

    return NextResponse.json({
      ok: true,
      needsWorkspace: setup.needsWorkspace,
      ...(setup.workspaceId ? { workspaceId: setup.workspaceId } : {}),
    })
  } catch (err) {
    console.error('[/api/auth/setup] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
