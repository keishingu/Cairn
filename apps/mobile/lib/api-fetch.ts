import { supabase } from './supabase'
import { API_BASE_URL as API_BASE } from './env'
import { getSelectedWorkspaceId } from './workspace-selection'
import type { Session } from '@supabase/supabase-js'

export async function apiFetch(
  path: string,
  init?: RequestInit,
  sessionOverride?: Session | null,
): Promise<Response> {
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
