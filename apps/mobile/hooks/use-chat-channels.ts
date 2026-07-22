import { useQuery } from '@tanstack/react-query'
import { FEATURE_FLAGS } from '@cairn/shared'
import { apiFetch } from '../lib/api-fetch'

export interface WorkspaceChannelDto {
  id: string
  name: string | null
  isPrivate: boolean
  memberCount: number
  memberNames: string[]
  memberAvatarUrls: (string | null)[]
  unreadCount: number
  unreadMentionCount: number
}

export interface DmChannelDto {
  id: string
  participantId: string
  participantName: string
  participantAvatarUrl: string | null
  unreadCount: number
  unreadMentionCount: number
}

function fetchJson<T>(path: string, errorLabel: string) {
  return async (): Promise<T> => {
    const res = await apiFetch(path)
    if (!res.ok) throw new Error(`${errorLabel}の取得に失敗しました (${res.status})`)
    return res.json() as Promise<T>
  }
}

export function useWorkspaceChannels() {
  return useQuery<WorkspaceChannelDto[]>({
    queryKey: ['workspace-channels'],
    queryFn: fetchJson('/api/workspaces/channels', 'チャンネル'),
  })
}

export function useWorkspaceDms() {
  return useQuery<DmChannelDto[]>({
    queryKey: ['workspace-dms'],
    queryFn: fetchJson('/api/workspaces/dms', 'ダイレクトメッセージ'),
    enabled: FEATURE_FLAGS.dm,
  })
}
