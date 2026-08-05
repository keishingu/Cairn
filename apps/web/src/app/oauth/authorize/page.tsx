// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { activeWorkspaceMembers, db, workspaces } from '@cairn/db'
import { eq } from 'drizzle-orm'
import { getAuthUser, WORKSPACE_COOKIE } from '@/lib/get-auth-context'
import { getOAuthIssuer } from '@/lib/mcp-oauth'
import { validateOAuthAuthorizationRequest } from '@/lib/mcp-oauth-authorization'
import { finishOAuthAuthorization } from './actions'

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
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
    return <AuthorizationError message={(validationError as Error).message} />
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
        <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 24px' }}>MCP接続の認可</p>

        <div style={summaryStyle}>
          <div style={labelStyle}>接続元</div>
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
          >
            対象ワークスペース
          </label>
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
                {membership.role === 'guest' ? '（ゲストは利用不可）' : ''}
              </option>
            ))}
          </select>

          <div style={{ ...labelStyle, marginBottom: 8 }}>要求される権限</div>
          <div style={summaryStyle}>
            <div style={{ fontWeight: 700 }}>
              {authorization.scope === 'write' ? '読み取り・書き込み' : '読み取り'}
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
              <li>プロジェクト、タスク、会話、ファイル本文の閲覧</li>
              {authorization.scope === 'write' && <li>タスクの作成・完了、メッセージの投稿</li>}
            </ul>
          </div>

          {!defaultWorkspace && (
            <div style={{ color: 'var(--red-text)', fontSize: 12.5, marginBottom: 12 }}>
              ゲストはMCP OAuth接続を認可できません。member以上のワークスペースが必要です。
            </div>
          )}
          <p style={{ color: 'var(--text-4)', fontSize: 11.5, lineHeight: 1.6 }}>
            接続後も、現在のCairnロールと各ツールの権限が毎回適用されます。設定の「連携」からいつでも取り消せます。
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-ghost" type="submit" name="decision" value="deny">
              キャンセル
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              name="decision"
              value="approve"
              disabled={!defaultWorkspace}
            >
              接続を許可
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

function AuthorizationError({ message }: { message: string }) {
  return (
    <main className="app app-root" style={pageStyle}>
      <div className="card" style={cardStyle}>
        <h1 style={{ fontSize: 18, margin: 0 }}>OAuthリクエストを確認できません</h1>
        <p style={{ color: 'var(--red-text)', fontSize: 13 }}>{message}</p>
        <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
          接続元へ戻り、もう一度お試しください。
        </p>
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
