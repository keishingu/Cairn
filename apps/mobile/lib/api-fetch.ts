import { supabase } from './supabase'
import { API_BASE_URL as API_BASE } from './env'
import { getSelectedWorkspaceId } from './workspace-selection'

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
    const workspaceId = await getSelectedWorkspaceId(session.user.id)
    if (workspaceId) headers.set('X-Cairn-Workspace-Id', workspaceId)
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}
