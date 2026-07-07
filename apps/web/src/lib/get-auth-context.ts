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

interface MembershipQueryDeps {
  db: Awaited<typeof import('@cairn/db')>['db']
  workspaceMembers: Awaited<typeof import('@cairn/db')>['workspaceMembers']
  userId: string
  workspaceId?: string | null
}

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

async function findActiveMembership({ db, workspaceMembers, userId, workspaceId = null }: MembershipQueryDeps) {
  const { eq, and } = await import('drizzle-orm')

  const conditions = [eq(workspaceMembers.userId, userId), eq(workspaceMembers.membershipStatus, 'active')]
  if (workspaceId) {
    conditions.push(eq(workspaceMembers.workspaceId, workspaceId))
  }

  const [member] = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(and(...conditions))
    .limit(1)

  return member ?? null
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

  const scopedCacheKey = preferredWorkspaceId ? `${user.id}:${preferredWorkspaceId}` : null
  const cacheKey = scopedCacheKey ?? user.id
  const cached = workspaceCache.get(cacheKey)

  try {
    const { db } = await import('@cairn/db')
    const { workspaceMembers } = await import('@cairn/db')
    const cachedWorkspaceId = cached && cached.expiresAt > Date.now() ? cached.workspaceId : null
    const requestedWorkspaceId = preferredWorkspaceId ?? cachedWorkspaceId

    // cookie / cache の候補ワークスペースも active membership として毎回再照合する
    if (requestedWorkspaceId) {
      const preferred = await findActiveMembership({
        db,
        workspaceMembers,
        userId: user.id,
        workspaceId: requestedWorkspaceId,
      })

      if (preferred) {
        workspaceCache.set(cacheKey, {
          workspaceId: preferred.workspaceId,
          expiresAt: Date.now() + 5 * 60 * 1000,
        })
        return { ctx: { userId: user.id, workspaceId: preferred.workspaceId }, error: null }
      }
      // cookie / cache が無効（退出済み等）→ フォールバック
    }

    const member = await findActiveMembership({
      db,
      workspaceMembers,
      userId: user.id,
    })

    if (!member) {
      return { ctx: null, error: NextResponse.json({ error: 'No workspace found' }, { status: 403 }) }
    }

    const expiresAt = Date.now() + 5 * 60 * 1000
    if (!preferredWorkspaceId) {
      workspaceCache.set(user.id, { workspaceId: member.workspaceId, expiresAt })
    } else {
      workspaceCache.set(cacheKey, { workspaceId: member.workspaceId, expiresAt })
    }
    return { ctx: { userId: user.id, workspaceId: member.workspaceId }, error: null }
  } catch (err) {
    console.error('[getAuthContext] DB query failed:', err)
    return { ctx: null, error: NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
  }
}
