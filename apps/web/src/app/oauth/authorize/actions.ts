// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/get-auth-context'
import {
  getOAuthIssuer,
  OAUTH_AUTHORIZATION_CODE_PREFIX,
  OAUTH_AUTHORIZATION_CODE_TTL_SECONDS,
  createOAuthSecret,
} from '@/lib/mcp-oauth'
import { validateOAuthAuthorizationRequest } from '@/lib/mcp-oauth-authorization'
import { getWorkspaceRole } from '@/lib/access/membership'

const authorizationKeys = [
  'client_id',
  'redirect_uri',
  'response_type',
  'response_mode',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
  'resource',
] as const

async function currentRequest(): Promise<Request> {
  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost'
  const protocol =
    requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return new Request(`${protocol}://${host}/oauth/authorize`, { headers: requestHeaders })
}

function authorizationParams(formData: FormData): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of authorizationKeys) {
    const value = formData.get(key)
    if (typeof value === 'string' && value) params.set(key, value)
  }
  return params
}

function callbackUrl(
  redirectUri: string,
  values: { code?: string; error?: string; state: string; issuer: string },
): string {
  const url = new URL(redirectUri)
  if (values.code) url.searchParams.set('code', values.code)
  if (values.error) url.searchParams.set('error', values.error)
  url.searchParams.set('state', values.state)
  url.searchParams.set('iss', values.issuer)
  return url.toString()
}

export async function finishOAuthAuthorization(formData: FormData) {
  const request = await currentRequest()
  const issuer = getOAuthIssuer(request)
  const params = authorizationParams(formData)
  const authorization = await validateOAuthAuthorizationRequest(params, `${issuer}/api/mcp`)

  if (formData.get('decision') === 'deny') {
    redirect(
      callbackUrl(authorization.redirectUri, {
        error: 'access_denied',
        state: authorization.state,
        issuer,
      }),
    )
  }

  const { userId, error } = await getAuthUser()
  if (error || !userId) {
    redirect(`/auth/login?next=${encodeURIComponent(`/oauth/authorize?${params}`)}`)
  }

  const workspaceId = formData.get('workspace_id')
  if (typeof workspaceId !== 'string') throw new Error('workspace is required')
  const role = await getWorkspaceRole(workspaceId, userId)
  if (!role) throw new Error('選択したワークスペースの有効なメンバーではありません')
  if (role === 'guest') throw new Error('ゲストはMCP OAuth接続を認可できません')

  const code = createOAuthSecret(OAUTH_AUTHORIZATION_CODE_PREFIX)
  const { db, mcpOAuthAuthorizationCodes, mcpOAuthConnections } = await import('@cairn/db')
  await db.transaction(async (tx) => {
    const [connection] = await tx
      .insert(mcpOAuthConnections)
      .values({
        clientId: authorization.clientId,
        userId,
        workspaceId,
        scope: authorization.scope,
        resource: authorization.resource,
      })
      .returning({ id: mcpOAuthConnections.id })
    if (!connection) throw new Error('OAuth connection creation failed')

    await tx.insert(mcpOAuthAuthorizationCodes).values({
      connectionId: connection.id,
      codeHash: code.hash,
      redirectUri: authorization.redirectUri,
      codeChallenge: authorization.codeChallenge,
      expiresAt: new Date(Date.now() + OAUTH_AUTHORIZATION_CODE_TTL_SECONDS * 1000),
    })
  })

  redirect(
    callbackUrl(authorization.redirectUri, {
      code: code.value,
      state: authorization.state,
      issuer,
    }),
  )
}
