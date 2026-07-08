// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'
import { WORKSPACE_COOKIE } from './workspace-cookie'

export { WORKSPACE_COOKIE } from './workspace-cookie'

// サーバーレス関数インスタンス内でワークスペース ID をキャッシュし、
// warm リクエストでの DB 往復を省く（キーは userId:workspaceId、TTL: 1分）
const workspaceCache = new Map<string, { workspaceId: string; expiresAt: number }>()
const WORKSPACE_CACHE_TTL_MS = 60 * 1000

function setWorkspaceCache(cacheKey: string, workspaceId: string) {
  workspaceCache.set(cacheKey, {
    workspaceId,
    expiresAt: Date.now() + WORKSPACE_CACHE_TTL_MS,
  })
}

export function invalidateWorkspaceCacheForUser(userId: string) {
  workspaceCache.delete(userId)
  for (const key of workspaceCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      workspaceCache.delete(key)
    }
  }
}

export interface AuthContext {
  userId: string
  workspaceId: string
}

type AuthResult =
  | { ctx: AuthContext; error: null }
  | { ctx: null; error: ReturnType<typeof NextResponse.json> }

type UserResult =
  | { userId: string; error: null }
  | { userId: null; error: ReturnType<typeof NextResponse.json> }

async function getAuthenticatedUser(
  authorization: string | null,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<User | null> {
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice(7)
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) {
      return null
    }
    return data.user
  }

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return null
  }
  return data.user
}

/** ワークスペース所属を問わずユーザー認証だけを行う（招待受け入れ等で使用） */
export async function getAuthUser(): Promise<UserResult> {
  const supabase = await createClient()
  const headersList = await headers()
  const authorization = headersList.get('Authorization')

  const user = await getAuthenticatedUser(authorization, supabase)
  if (!user) {
    return { userId: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { userId: user.id, error: null }
}

export async function getAuthContext(): Promise<AuthResult> {
  const supabase = await createClient()
  const headersList = await headers()
  const authorization = headersList.get('Authorization')

  const user = await getAuthenticatedUser(authorization, supabase)
  if (!user) {
    return { ctx: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const cookieStore = await cookies()
  const preferredWorkspaceId = cookieStore.get(WORKSPACE_COOKIE)?.value ?? null

  const cacheKey = preferredWorkspaceId ? `${user.id}:${preferredWorkspaceId}` : user.id
  const cached = workspaceCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return { ctx: { userId: user.id, workspaceId: cached.workspaceId }, error: null }
  }

  try {
    const { db } = await import('@cairn/db')
    const { workspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    // クッキーで指定されたワークスペースがあればそちらを優先、ただしメンバーシップを確認
    if (preferredWorkspaceId) {
      const [preferred] = await db
        .select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.workspaceId, preferredWorkspaceId)))
        .limit(1)

      if (preferred) {
        setWorkspaceCache(cacheKey, preferred.workspaceId)
        return { ctx: { userId: user.id, workspaceId: preferred.workspaceId }, error: null }
      }
      // クッキーが無効（退出済み等）→ フォールバック
    }

    const [member] = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user.id))
      .limit(1)

    if (!member) {
      return { ctx: null, error: NextResponse.json({ error: 'No workspace found' }, { status: 403 }) }
    }

    setWorkspaceCache(user.id, member.workspaceId)
    return { ctx: { userId: user.id, workspaceId: member.workspaceId }, error: null }
  } catch (err) {
    console.error('[getAuthContext] DB query failed:', err)
    return { ctx: null, error: NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
  }
}
