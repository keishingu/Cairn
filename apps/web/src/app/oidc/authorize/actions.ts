// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use server'

import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/get-auth-context'
import {
  buildOidcRedirect,
  issueOidcAuthorizationCode,
  OidcAuthorizeError,
  validateOidcAuthorizationRequest,
} from '@/lib/oidc/authorization'
import { OIDC_AUTHORIZATION_PARAMS, oidcAuthTime } from '@/lib/oidc/config'

export type OidcConsentState = { error: string } | null

/**
 * 同意画面の許可・拒否。サーバーアクションは Next.js が送信元の origin を確かめるため、
 * 他サイトから許可を送らせることはできない。リクエストは画面に埋めた値を受け取り直し、もう一度検証する
 */
export async function decideOidcAuthorization(
  _previous: OidcConsentState,
  formData: FormData,
): Promise<OidcConsentState> {
  const params = new URLSearchParams()
  for (const key of OIDC_AUTHORIZATION_PARAMS) {
    const value = formData.get(key)
    if (typeof value === 'string') params.set(key, value)
  }

  const { userId, user, error: authError } = await getAuthUser()
  if (authError || !userId) redirect(`/auth/login?next=${encodeURIComponent(`/oidc/authorize?${params}`)}`)

  let destination: string
  try {
    const authorization = await validateOidcAuthorizationRequest(params)
    // 押したボタンの値1つだけを受け付ける。値が複数あれば許可として扱わない
    const decisions = formData.getAll('decision')
    if (decisions.length !== 1 || decisions[0] !== 'approve') {
      destination = buildOidcRedirect(authorization.redirectUri, {
        error: 'access_denied',
        state: authorization.state,
      })
    } else {
      destination = await issueOidcAuthorizationCode({
        userId,
        authTime: oidcAuthTime(user),
        authorization,
      })
    }
  } catch (error) {
    if (error instanceof OidcAuthorizeError) {
      if (error.redirect) {
        redirect(buildOidcRedirect(error.redirect.uri, { error: error.code, state: error.redirect.state }))
      }
      return { error: 'This sign-in request is invalid. Return to the app and try again.' }
    }
    console.error('[oidc/authorize] decision failed:', error)
    return { error: 'Could not complete the sign-in request. Return to the app and try again.' }
  }
  redirect(destination)
}
