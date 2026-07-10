// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'
import { WORKSPACE_COOKIE } from './workspace-cookie'

export { WORKSPACE_COOKIE } from './workspace-cookie'

// サーバーレス関数インスタンス内でワークスペース ID をキャッシュし、
// warm リクエストでの DB 往復を省く（キーは userId:workspaceId、TTL: 5分）
const workspaceCache = new Map<string, { workspaceId: string; expiresAt: number }>()

function buildWorkspaceCacheKey(userId: string, preferredWorkspaceId: string | null): string {
  return preferredWorkspaceId ? `${userId}:${preferredWorkspaceId}` : userId
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
  const cacheKey = buildWorkspaceCacheKey(user.id, preferredWorkspaceId)
  const fallbackCacheKey = buildWorkspaceCacheKey(user.id, null)
  const cachedPreferred = workspaceCache.get(cacheKey)
  const cachedFallback = workspaceCache.get(fallbackCacheKey)
  const cachedPreferredWorkspaceId = cachedPreferred && cachedPreferred.expiresAt > Date.now()
    ? cachedPreferred.workspaceId
    : null
  const cachedFallbackWorkspaceId = cachedFallback && cachedFallback.expiresAt > Date.now()
    ? cachedFallback.workspaceId
    : null

  try {
    const { db } = await import('@cairn/db')
    const { activeWorkspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    const findActiveMembership = async (workspaceId?: string) => {
      const conditions = [eq(activeWorkspaceMembers.userId, user.id)]
      if (workspaceId) conditions.push(eq(activeWorkspaceMembers.workspaceId, workspaceId))
      const [row] = await db
        .select({ workspaceId: activeWorkspaceMembers.workspaceId })
        .from(activeWorkspaceMembers)
        .where(and(...conditions))
        .limit(1)
      return row ?? null
    }

    const candidateWorkspaceIds = [
      preferredWorkspaceId,
      cachedPreferredWorkspaceId,
      cachedFallbackWorkspaceId,
    ].filter((workspaceId, index, values): workspaceId is string => (
      Boolean(workspaceId) && values.indexOf(workspaceId) === index
    ))

    for (const candidateWorkspaceId of candidateWorkspaceIds) {
      const member = await findActiveMembership(candidateWorkspaceId)
      if (!member) continue

      const targetCacheKey = candidateWorkspaceId === preferredWorkspaceId ? cacheKey : fallbackCacheKey
      workspaceCache.set(targetCacheKey, {
        workspaceId: member.workspaceId,
        expiresAt: Date.now() + 5 * 60 * 1000,
      })
      return { ctx: { userId: user.id, workspaceId: member.workspaceId }, error: null }
    }

    const member = await findActiveMembership()
    if (!member) {
      return { ctx: null, error: NextResponse.json({ error: 'No workspace found' }, { status: 403 }) }
    }

    workspaceCache.set(fallbackCacheKey, { workspaceId: member.workspaceId, expiresAt: Date.now() + 5 * 60 * 1000 })
    return { ctx: { userId: user.id, workspaceId: member.workspaceId }, error: null }
  } catch (err) {
    console.error('[getAuthContext] DB query failed:', err)
    return { ctx: null, error: NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
  }
}
