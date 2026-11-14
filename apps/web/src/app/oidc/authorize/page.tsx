// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { translate } from '@cairn/shared'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/get-auth-context'
import { readRequestLocale } from '@/lib/i18n/request-locale'
import {
  buildOidcRedirect,
  issueOidcAuthorizationCode,
  OidcAuthorizeError,
  validateOidcAuthorizationRequest,
} from '@/lib/oidc/authorization'
import { describeOidcScopes, OIDC_AUTHORIZATION_PARAMS, oidcAuthTime } from '@/lib/oidc/config'
import { ConsentForm } from './consent-form'

type TranslateFn = (message: string, values?: Record<string, string | number>) => string

/**
 * 「Cairn でログイン」（OIDC）の認可エンドポイントと同意画面（docs/oidc-design.md §4・§8）。
 * MCP 用の自前 OAuth（/oauth/authorize）とはクライアント・コードを分ける。
 * 同じスコープで許可済みなら同意画面を出さずにコードを発行して戻す
 */
export default async function OidcAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await readRequestLocale()
  const t: TranslateFn = (message, values) => translate(locale, message, values)
  const query = await searchParams
  const params = new URLSearchParams()
  for (const key of OIDC_AUTHORIZATION_PARAMS) {
    const value = query[key]
    if (typeof value === 'string') params.set(key, value)
  }

  let authorization: Awaited<ReturnType<typeof validateOidcAuthorizationRequest>>
  try {
    authorization = await validateOidcAuthorizationRequest(params)
  } catch (error) {
    if (error instanceof OidcAuthorizeError) {
      if (error.redirect) {
        redirect(buildOidcRedirect(error.redirect.uri, { error: error.code, state: error.redirect.state }))
      }
      return <ConsentError message={t('This sign-in request is invalid. Return to the app and try again.')} t={t} />
    }
    throw error
  }

  const { userId, user, error: authError } = await getAuthUser()
  if (authError || !userId) redirect(`/auth/login?next=${encodeURIComponent(`/oidc/authorize?${params}`)}`)

  const destination = await issueOidcAuthorizationCode({
    userId,
    authTime: oidcAuthTime(user),
    authorization,
  }, true)
  if (destination) redirect(destination)

  const scopes = describeOidcScopes(authorization.scope)

  return (
    <main className="app app-root" style={pageStyle}>
      <div className="card" style={cardStyle}>
        <div style={{ fontSize: 'var(--fs-4xl)', fontWeight: 600, letterSpacing: '-0.02em' }}>Cairn</div>
        <p style={{ color: 'var(--text-3)', fontSize: 'var(--fs-md)', margin: '4px 0 24px' }}>{t('Sign in with Cairn')}</p>

        <div style={summaryStyle}>
          <div style={labelStyle}>{t('App requesting access')}</div>
          <div style={{ fontWeight: 600 }}>{authorization.clientName}</div>
          <div style={{ color: 'var(--text-4)', fontSize: 'var(--fs-xs)', marginTop: 2 }}>
            {new URL(authorization.redirectUri).hostname}
          </div>
        </div>

        <div style={{ ...labelStyle, marginBottom: 8 }}>{t('Information shared with this app')}</div>
        <div style={summaryStyle}>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)', fontSize: 'var(--fs-md)', lineHeight: 1.7 }}>
            {scopes.map((scope) => (
              <li key={scope}>{t(scope)}</li>
            ))}
          </ul>
          {user.email && (
            <div style={{ color: 'var(--text-4)', fontSize: 'var(--fs-sm)', marginTop: 8 }}>
              {t('Signed in as {email}', { email: user.email })}
            </div>
          )}
        </div>

        <p style={{ color: 'var(--text-4)', fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
          {t('This app receives only the information above. It cannot read or change your projects, conversations, or files in Cairn. You can revoke access anytime from Settings, Integrations.')}
        </p>
        <ConsentForm params={Object.fromEntries(params)} />
      </div>
    </main>
  )
}

function ConsentError({ message, t }: { message: string; t: TranslateFn }) {
  return (
    <main className="app app-root" style={pageStyle}>
      <div className="card" style={cardStyle}>
        <h1 style={{ fontSize: 'var(--fs-2xl)', margin: 0 }}>{t('Could not verify the sign-in request')}</h1>
        <p style={{ color: 'var(--red-text)', fontSize: 'var(--fs-md)' }}>{message}</p>
      </div>
    </main>
  )
}

const pageStyle = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  background: 'var(--bg)',
}
const cardStyle = { width: '100%', maxWidth: 520, padding: 28 }
const summaryStyle = {
  padding: 14,
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--card-2)',
  marginBottom: 20,
}
const labelStyle = { color: 'var(--text-3)', fontSize: 'var(--fs-sm)', fontWeight: 600 }
