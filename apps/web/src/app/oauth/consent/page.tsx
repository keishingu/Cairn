// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { translate } from '@cairn/shared'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/get-auth-context'
import { readRequestLocale } from '@/lib/i18n/request-locale'
import { describeOidcScopes, parseAuthorizationId } from '@/lib/oidc-consent'
import { createClient } from '@/lib/supabase/server'
import { ConsentForm } from './consent-form'

type TranslateFn = (message: string, values?: Record<string, string | number>) => string

/**
 * 「Cairn でログイン」（OIDC）の同意画面。Supabase Auth の OAuth 2.1 Server が
 * `?authorization_id=...` を付けてここへ送ってくる（docs/oidc-design.md §4・§6）。
 * MCP 専用の自前 OAuth（/oauth/authorize）とは別物。
 */
export default async function OidcConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await readRequestLocale()
  const t: TranslateFn = (message, values) => translate(locale, message, values)
  const authorizationId = parseAuthorizationId((await searchParams)['authorization_id'])
  if (!authorizationId) {
    return <ConsentError message={t('This sign-in request is invalid. Return to the app and try again.')} t={t} />
  }

  const { userId, error: authError } = await getAuthUser()
  if (authError || !userId) {
    redirect(`/auth/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  if (error || !data) {
    console.error('[oauth/consent] failed to load authorization details:', error)
    return <ConsentError message={t('This sign-in request has expired or was not found. Return to the app and try again.')} t={t} />
  }
  // 以前に同じスコープで同意済みなら、Supabase は同意画面を出さずに戻り先だけを返す
  if (!('authorization_id' in data)) redirect(data.redirect_url)

  const scopes = describeOidcScopes(data.scope)

  return (
    <main className="app app-root" style={pageStyle}>
      <div className="card" style={cardStyle}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>Cairn</div>
        <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 24px' }}>{t('Sign in with Cairn')}</p>

        <div style={summaryStyle}>
          <div style={labelStyle}>{t('App requesting access')}</div>
          <div style={{ fontWeight: 700 }}>{data.client.name}</div>
          <div style={{ color: 'var(--text-4)', fontSize: 11, marginTop: 2 }}>
            {new URL(data.redirect_uri).hostname}
          </div>
        </div>

        <div style={{ ...labelStyle, marginBottom: 8 }}>{t('Information shared with this app')}</div>
        <div style={summaryStyle}>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)', fontSize: 12.5, lineHeight: 1.7 }}>
            {scopes.map((scope) => (
              <li key={scope}>{t(scope)}</li>
            ))}
          </ul>
          <div style={{ color: 'var(--text-4)', fontSize: 11.5, marginTop: 8 }}>
            {t('Signed in as {email}', { email: data.user.email })}
          </div>
        </div>

        <p style={{ color: 'var(--text-4)', fontSize: 11.5, lineHeight: 1.6 }}>
          {t('This app can only identify who you are. It cannot read or change your projects, conversations, or files in Cairn. You can revoke access anytime from Settings, Integrations.')}
        </p>
        <ConsentForm authorizationId={authorizationId} />
      </div>
    </main>
  )
}

function ConsentError({ message, t }: { message: string; t: TranslateFn }) {
  return (
    <main className="app app-root" style={pageStyle}>
      <div className="card" style={cardStyle}>
        <h1 style={{ fontSize: 18, margin: 0 }}>{t('Could not verify the sign-in request')}</h1>
        <p style={{ color: 'var(--red-text)', fontSize: 13 }}>{message}</p>
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
const labelStyle = { color: 'var(--text-3)', fontSize: 11.5, fontWeight: 600 }
