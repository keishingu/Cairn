// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'
import { WORKSPACE_COOKIE } from './workspace-cookie'
import { setCachedWorkspaceRole } from './request-context'

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

  // cookie / cache はどの workspace を候補にするかのヒントに使うだけで、
  // active membership の再照合は毎回行う。これがないと、非活性化された直後でも
  // warm instance の 5 分 cache が旧 workspace を返し続け、遮断が遅延する。
  const cacheKey = preferredWorkspaceId ? `${user.id}:${preferredWorkspaceId}` : user.id
  const cached = workspaceCache.get(cacheKey)
  const cachedWorkspaceId = cached && cached.expiresAt > Date.now() ? cached.workspaceId : null

  try {
    const { db } = await import('@cairn/db')
    const { activeWorkspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    const findActiveMembership = async (workspaceId?: string) => {
      const conditions = [eq(activeWorkspaceMembers.userId, user.id)]
      if (workspaceId) conditions.push(eq(activeWorkspaceMembers.workspaceId, workspaceId))
      const [row] = await db
        .select({
          workspaceId: activeWorkspaceMembers.workspaceId,
          role: activeWorkspaceMembers.role,
        })
        .from(activeWorkspaceMembers)
        .where(and(...conditions))
        .limit(1)
      return row ?? null
    }

    // cookie / cache の候補 workspace も active membership として毎回再照合する
    const requestedWorkspaceId = preferredWorkspaceId ?? cachedWorkspaceId
    if (requestedWorkspaceId) {
      const preferred = await findActiveMembership(requestedWorkspaceId)
      if (preferred) {
        await setCachedWorkspaceRole(preferred.workspaceId, user.id, preferred.role)
        workspaceCache.set(cacheKey, { workspaceId: preferred.workspaceId, expiresAt: Date.now() + 5 * 60 * 1000 })
        return { ctx: { userId: user.id, workspaceId: preferred.workspaceId }, error: null }
      }
      // 候補が無効（非活性化・退出済み等）→ active 所属へフォールバック
    }

    const member = await findActiveMembership()
    if (!member) {
      return { ctx: null, error: NextResponse.json({ error: 'No workspace found' }, { status: 403 }) }
    }

    await setCachedWorkspaceRole(member.workspaceId, user.id, member.role)
    // cookie が無い bearer-only request が別 request の cookie 選択を継承しないよう、
    // cookie の有無で cache key を分けて書く
    workspaceCache.set(cacheKey, { workspaceId: member.workspaceId, expiresAt: Date.now() + 5 * 60 * 1000 })
    return { ctx: { userId: user.id, workspaceId: member.workspaceId }, error: null }
  } catch (err) {
    console.error('[getAuthContext] DB query failed:', err)
    return { ctx: null, error: NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
  }
}
