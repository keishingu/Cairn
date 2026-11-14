import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { apiFetch } from './api-fetch'
import { supabase } from './supabase'

type HandoffResult =
  | { status: 'ready'; tokenHash: string; workspaceId: string | undefined }
  | { status: 'signed-out' | 'failed' }

export async function requestWebViewHandoff(): Promise<HandoffResult> {
  let { data: { session }, error } = await supabase.auth.getSession()
  if (!session) {
    return { status: error && isAuthRetryableFetchError(error) ? 'failed' : 'signed-out' }
  }

  const request = (auth: typeof session) => apiFetch('/api/auth/webview-handoff', { method: 'POST' }, auth)
  let response = await request(session)
  if (response.status === 401) {
    // Cookie の失効だけでネイティブを更新しない。Bearer が拒否されたときだけ更新を試す。
    ;({ data: { session }, error } = await supabase.auth.refreshSession())
    if (!session) {
      return { status: error && isAuthRetryableFetchError(error) ? 'failed' : 'signed-out' }
    }
    response = await request(session)
  }
  if (!response.ok) return { status: 'failed' }

  const data = (await response.json()) as { tokenHash?: string; workspaceId?: string }
  if (typeof data.tokenHash !== 'string' || !data.tokenHash) return { status: 'failed' }
  return { status: 'ready', tokenHash: data.tokenHash, workspaceId: data.workspaceId }
}
