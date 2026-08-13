// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { verifyAccessToken } from './auth-jwt'
import type { WorkspaceRole } from './access/membership'
import { WORKSPACE_COOKIE } from './workspace-cookie'
import {
  API_TOKEN_PREFIX,
  ApiTokenError,
  apiTokenAllows,
  isApiTokenAccessEnabled,
  verifyApiToken,
  type ApiTokenScope,
} from './api-tokens'
import { OAUTH_ACCESS_TOKEN_PREFIX } from './mcp-oauth'
import { getVerifiedMcpRequest } from './mcp-request-context'

export { WORKSPACE_COOKIE } from './workspace-cookie'

// サーバーレス関数インスタンス内でワークスペース ID + role をキャッシュし、
// warm リクエストでの DB 往復を省く（キーは userId:workspaceId、TTL: 5分）
const workspaceCache = new Map<
  string,
  { workspaceId: string; role: WorkspaceRole; expiresAt: number }
>()

export interface AuthContext {
  userId: string
  workspaceId: string
  // 再照合した active membership のロール。ルート側はこれを使い、
  // requireWorkspace* / getWorkspaceRole の二重照会を避ける（P2）。
  role: WorkspaceRole
}

type AuthResult =
  | { ctx: AuthContext; error: null }
  | { ctx: null; error: ReturnType<typeof NextResponse.json> }

type UserResult =
  | { userId: string; error: null }
  | { userId: null; error: ReturnType<typeof NextResponse.json> }

/**
 * Authorization ヘッダの Bearer トークン、なければ Cookie セッションを
 * JWT ローカル検証（可能な場合）して認証済みユーザー ID を返す。
 */
async function getAuthenticatedUserId(
  authorization: string | null,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  if (authorization?.startsWith('Bearer ')) {
    return verifyAccessToken(supabase.auth, authorization.slice(7))
  }
  return verifyAccessToken(supabase.auth)
}

/**
 * ワークスペース所属を問わずユーザー認証だけを行う（招待受け入れ等で使用）。
 * Authサーバーへ再照合し、アカウント削除後も有効期限内のJWTだけで操作できないようにする。
 */
export async function getAuthUser(): Promise<UserResult> {
  const supabase = await createClient()
  const headersList = await headers()
  const authorization = headersList.get('Authorization')
  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined

  const { data: { user }, error } = await supabase.auth.getUser(bearerToken)
  if (error || !user) {
    return { userId: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { userId: user.id, error: null }
}

export async function getAuthContext(options?: {
  allowApiToken?: boolean
  requiredApiTokenScope?: ApiTokenScope
}): Promise<AuthResult> {
  const supabase = await createClient()
  const headersList = await headers()
  const authorization = headersList.get('Authorization')

  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  if (bearerToken?.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)) {
    const verified = getVerifiedMcpRequest()
    if (
      !options?.allowApiToken ||
      !verified ||
      verified.rawToken !== bearerToken ||
      verified.expiresAt <= new Date()
    ) {
      return { ctx: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
    if (!apiTokenAllows(verified.scope, options.requiredApiTokenScope ?? 'read')) {
      return {
        ctx: null,
        error: NextResponse.json(
          { error: 'OAuth token does not have the required scope' },
          { status: 403 },
        ),
      }
    }
    return {
      ctx: {
        userId: verified.userId,
        workspaceId: verified.workspaceId,
        role: verified.role,
      },
      error: null,
    }
  }

  if (bearerToken?.startsWith(API_TOKEN_PREFIX)) {
    if (!options?.allowApiToken || !isApiTokenAccessEnabled()) {
      return { ctx: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
    try {
      const verified = await verifyApiToken(bearerToken, {
        requiredScope: options.requiredApiTokenScope ?? 'read',
      })
      return {
        ctx: {
          userId: verified.userId,
          workspaceId: verified.workspaceId,
          role: verified.role,
        },
        error: null,
      }
    } catch (error) {
      if (error instanceof ApiTokenError) {
        return {
          ctx: null,
          error: NextResponse.json({ error: error.message }, { status: error.status }),
        }
      }
      console.error('[getAuthContext] API token verification failed:', error)
      return {
        ctx: null,
        error: NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
      }
    }
  }

  const userId = await getAuthenticatedUserId(authorization, supabase)
  if (!userId) {
    return { ctx: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const cookieStore = await cookies()
  const requestedWorkspaceId = headersList.get('X-Cairn-Workspace-Id')
  const preferredWorkspaceId =
    requestedWorkspaceId ?? cookieStore.get(WORKSPACE_COOKIE)?.value ?? null

  // cookie / cache はどの workspace を候補にするかのヒントに使うだけで、
  // active membership の再照合は毎回行う。これがないと、非活性化された直後でも
  // warm instance の 5 分 cache が旧 workspace を返し続け、遮断が遅延する。
  const cacheKey = preferredWorkspaceId ? `${userId}:${preferredWorkspaceId}` : userId
  const cached = workspaceCache.get(cacheKey)
  const cachedWorkspaceId = cached && cached.expiresAt > Date.now() ? cached.workspaceId : null

  try {
    const { db } = await import('@cairn/db')
    const { activeWorkspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    // role も同じクエリで取得する（1 往復のまま。ルート側の二重照会を無くすため）
    const findActiveMembership = async (workspaceId?: string) => {
      const conditions = [eq(activeWorkspaceMembers.userId, userId)]
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
    const workspaceCandidate = preferredWorkspaceId ?? cachedWorkspaceId
    if (workspaceCandidate) {
      const preferred = await findActiveMembership(workspaceCandidate)
      if (preferred) {
        workspaceCache.set(cacheKey, {
          workspaceId: preferred.workspaceId,
          role: preferred.role,
          expiresAt: Date.now() + 5 * 60 * 1000,
        })
        return {
          ctx: { userId, workspaceId: preferred.workspaceId, role: preferred.role },
          error: null,
        }
      }
      // 候補が無効（非活性化・退出済み等）→ active 所属へフォールバック
    }

    const member = await findActiveMembership()
    if (!member) {
      return {
        ctx: null,
        error: NextResponse.json({ error: 'No workspace found' }, { status: 403 }),
      }
    }

    // cookie が無い bearer-only request が別 request の cookie 選択を継承しないよう、
    // cookie の有無で cache key を分けて書く
    workspaceCache.set(cacheKey, {
      workspaceId: member.workspaceId,
      role: member.role,
      expiresAt: Date.now() + 5 * 60 * 1000,
    })
    return { ctx: { userId, workspaceId: member.workspaceId, role: member.role }, error: null }
  } catch (err) {
    console.error('[getAuthContext] DB query failed:', err)
    return {
      ctx: null,
      error: NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    }
  }
}
