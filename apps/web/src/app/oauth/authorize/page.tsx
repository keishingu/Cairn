// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { translate } from '@cairn/shared'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { activeWorkspaceMembers, db, workspaces } from '@cairn/db'
import { eq } from 'drizzle-orm'
import { getAuthUser, WORKSPACE_COOKIE } from '@/lib/get-auth-context'
import { getOAuthIssuer } from '@/lib/mcp-oauth'
import { validateOAuthAuthorizationRequest } from '@/lib/mcp-oauth-authorization'
import { readRequestLocale } from '@/lib/i18n/request-locale'
import { finishOAuthAuthorization } from './actions'

type TranslateFn = (message: string, values?: Record<string, string | number>) => string

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await readRequestLocale()
  const t: TranslateFn = (message, values) => translate(locale, message, values)
  const rawParams = await searchParams
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === 'string') params.set(key, value)
  }

  const { userId, error } = await getAuthUser()
  if (error || !userId)
    redirect(`/auth/login?next=${encodeURIComponent(`/oauth/authorize?${params}`)}`)

  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost'
  const protocol =
    requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const request = new Request(`${protocol}://${host}/oauth/authorize`, { headers: requestHeaders })

  let authorization: Awaited<ReturnType<typeof validateOAuthAuthorizationRequest>>
  try {
    authorization = await validateOAuthAuthorizationRequest(
      params,
      `${getOAuthIssuer(request)}/api/mcp`,
    )
  } catch (validationError) {
    return <AuthorizationError message={(validationError as Error).message} t={t} />
  }

  const memberships = await db
    .select({ id: workspaces.id, name: workspaces.name, role: activeWorkspaceMembers.role })
    .from(activeWorkspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, activeWorkspaceMembers.workspaceId))
    .where(eq(activeWorkspaceMembers.userId, userId))
  const preferredWorkspace = (await cookies()).get(WORKSPACE_COOKIE)?.value
  const defaultWorkspace =
    memberships.find(
      (membership) => membership.id === preferredWorkspace && membership.role !== 'guest',
    ) ?? memberships.find((membership) => membership.role !== 'guest')

  return (
    <main className="app app-root" style={pageStyle}>
      <div className="card" style={cardStyle}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>Cairn</div>
        <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 24px' }}>{t('MCP connection authorization')}</p>

        <div style={summaryStyle}>
          <div style={labelStyle}>{t('Connected from')}</div>
          <div style={{ fontWeight: 700 }}>{authorization.clientName}</div>
          <div style={{ color: 'var(--text-4)', fontSize: 11, marginTop: 2 }}>
            {new URL(authorization.redirectUri).hostname}
          </div>
        </div>

        <form action={finishOAuthAuthorization}>
          {[...params.entries()].map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}

          <label
            style={{ ...labelStyle, display: 'block', marginBottom: 6 }}
            htmlFor="workspace_id"
          >{t('Target workspace')}</label>
          <select
            id="workspace_id"
            name="workspace_id"
            className="form-control"
            defaultValue={defaultWorkspace?.id}
            required
            style={{ width: '100%', marginBottom: 20 }}
          >
            {memberships.map((membership) => (
              <option
                key={membership.id}
                value={membership.id}
                disabled={membership.role === 'guest'}
              >
                {membership.name}
                {membership.role === 'guest' ? t('(Guests cannot use this)') : ''}
              </option>
            ))}
          </select>

          <div style={{ ...labelStyle, marginBottom: 8 }}>{t('Requested permissions')}</div>
          <div style={summaryStyle}>
            <div style={{ fontWeight: 700 }}>
              {authorization.scope === 'write' ? t('Read and write access') : t('Read')}
            </div>
            <ul
              style={{
                margin: '8px 0 0',
                paddingLeft: 18,
                color: 'var(--text-3)',
                fontSize: 12.5,
                lineHeight: 1.7,
              }}
            >
              <li>{t('View projects, tasks, conversations, and file contents')}</li>
              {authorization.scope === 'write' && <li>{t('Create and complete tasks, and post messages')}</li>}
            </ul>
          </div>

          {!defaultWorkspace && (
            <div style={{ color: 'var(--red-text)', fontSize: 12.5, marginBottom: 12 }}>{t('Guests cannot authorize an MCP OAuth connection. A member workspace or higher is required.')}</div>
          )}
          <p style={{ color: 'var(--text-4)', fontSize: 11.5, lineHeight: 1.6 }}>{t('After connecting, your current Cairn role and each tool permission still apply. You can revoke access anytime from Settings, Integrations.')}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-ghost" type="submit" name="decision" value="deny">{t('Cancel')}</button>
            <button
              className="btn btn-primary"
              type="submit"
              name="decision"
              value="approve"
              disabled={!defaultWorkspace}
            >{t('Allow connection')}</button>
          </div>
        </form>
      </div>
    </main>
  )
}

function AuthorizationError({ message, t }: { message: string; t: TranslateFn }) {
  return (
    <main className="app app-root" style={pageStyle}>
      <div className="card" style={cardStyle}>
        <h1 style={{ fontSize: 18, margin: 0 }}>{t('Could not verify the OAuth request')}</h1>
        <p style={{ color: 'var(--red-text)', fontSize: 13 }}>{message}</p>
        <p style={{ color: 'var(--text-3)', fontSize: 12 }}>{t('Return to the app and try again.')}</p>
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
