import { supabase } from './supabase'
import { API_BASE_URL as API_BASE } from './env'
import { getSelectedWorkspaceId } from './workspace-selection'
import { isDeviceOffline } from './device-offline'
import type { Session } from '@supabase/supabase-js'

export async function apiFetch(
  path: string,
  init?: RequestInit,
  sessionOverride?: Session | null,
): Promise<Response> {
  // アクセストークンが切れていると、圏外の getSession は更新の再試行で約 25 秒止まり、
  // 後続の呼び出しも認証ロックで直列に待つ。届かないのは確かなので fetch の失敗と同じ形で即失敗させる
  if (!sessionOverride && (await isDeviceOffline())) throw new TypeError('Network request failed')
  // 認証直後はSecureStoreへの永続化より先にプロフィールAPIを呼ぶことがあるため、
  // 呼び出し元が取得済みのセッションを渡した場合はそれを優先する。
  const session = sessionOverride ?? (await supabase.auth.getSession()).data.session
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
    const workspaceId = await getSelectedWorkspaceId(session.user.id)
    if (workspaceId) headers.set('X-Cairn-Workspace-Id', workspaceId)
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

export async function apiActionError(
  request: Promise<Response>,
  fallback: string,
): Promise<string | null> {
  try {
    const response = await request
    if (response.ok) return null
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    return data.error ?? fallback
  } catch {
    return fallback
  }
}
