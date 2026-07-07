import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

export type InviteExpiresIn = '1h' | '30d' | 'never'

export interface WorkspaceInviteRecord {
  id: string
  token: string
  url: string
  expiresAt: string | null
  maxUses: number | null
  useCount: number
  role: string
  createdAt: string
  createdByName: string
}

interface WorkspaceInvitesResponse {
  invites?: WorkspaceInviteRecord[]
}

export function useWorkspaceInvites(enabled: boolean) {
  return useQuery<WorkspaceInviteRecord[]>({
    queryKey: ['workspace-invites'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/workspaces/invites')
      if (!res.ok) throw new Error('招待リンクの取得に失敗しました')
      const data = await res.json() as WorkspaceInvitesResponse
      return data.invites ?? []
    },
    enabled,
  })
}

export function useCreateWorkspaceInvite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ expiresIn }: { expiresIn: InviteExpiresIn }) => {
      const res = await fetchWithAuth('/api/workspaces/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn }),
      })
      const data = await res.json().catch(() => ({})) as {
        url?: string
        token?: string
        expiresAt?: string | null
        role?: string
        error?: string
      }

      if (!res.ok || !data.url || !data.token) {
        throw new Error(data.error ?? '招待リンクの生成に失敗しました')
      }

      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspace-invites'] })
    },
  })
}

export function useRevokeWorkspaceInvite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (token: string) => {
      const res = await fetchWithAuth(`/api/workspaces/invites/${token}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? '無効化に失敗しました')
      }
      return token
    },
    onSuccess: (token) => {
      queryClient.setQueryData<WorkspaceInviteRecord[]>(
        ['workspace-invites'],
        old => old?.filter(invite => invite.token !== token) ?? [],
      )
    },
  })
}
