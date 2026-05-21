// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DEV_USER_ID      = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'

// サーバーレス関数インスタンス内でワークスペース ID をキャッシュし、
// warm リクエストでの DB 往復を省く（TTL: 5分）
const workspaceCache = new Map<string, { workspaceId: string; expiresAt: number }>()

export interface AuthContext {
  userId: string
  workspaceId: string
}

type AuthResult =
  | { ctx: AuthContext; error: null }
  | { ctx: null; error: ReturnType<typeof NextResponse.json> }

export async function getAuthContext(): Promise<AuthResult> {
  if (!process.env['DATABASE_URL']) {
    return { ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID }, error: null }
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { ctx: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const cached = workspaceCache.get(user.id)
  if (cached && cached.expiresAt > Date.now()) {
    return { ctx: { userId: user.id, workspaceId: cached.workspaceId }, error: null }
  }

  try {
    const { db } = await import('@cairn/db')
    const { workspaceMembers } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    const [member] = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user.id))
      .limit(1)

    if (!member) {
      return { ctx: null, error: NextResponse.json({ error: 'No workspace found' }, { status: 403 }) }
    }

    workspaceCache.set(user.id, { workspaceId: member.workspaceId, expiresAt: Date.now() + 5 * 60 * 1000 })
    return { ctx: { userId: user.id, workspaceId: member.workspaceId }, error: null }
  } catch (err) {
    console.error('[getAuthContext] DB query failed:', err)
    return { ctx: null, error: NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
  }
}

