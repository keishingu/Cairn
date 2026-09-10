import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { ProfileAttributeColor, ProfileAttributeDto } from '@cairn/shared'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

const QUERY_KEY = ['profile-attributes'] as const

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null
  return body?.error ?? fallback
}

function invalidateProfileAttributes(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  void queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
  void queryClient.invalidateQueries({ queryKey: ['messages'] })
}

export function useProfileAttributes(enabled = true) {
  return useQuery<ProfileAttributeDto[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetchWithAuth('/api/workspaces/profile-attributes')
      if (!response.ok) throw new Error(await readError(response, '属性を取得できませんでした'))
      return response.json() as Promise<ProfileAttributeDto[]>
    },
    enabled,
  })
}

export function useCreateProfileAttribute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: ProfileAttributeColor }) => {
      const response = await fetchWithAuth('/api/workspaces/profile-attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
      if (!response.ok) throw new Error(await readError(response, '属性を追加できませんでした'))
    },
    onSuccess: () => invalidateProfileAttributes(queryClient),
  })
}

export function useUpdateProfileAttribute(attributeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: ProfileAttributeColor }) => {
      const response = await fetchWithAuth(`/api/workspaces/profile-attributes/${attributeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
      if (!response.ok) throw new Error(await readError(response, '属性を更新できませんでした'))
    },
    onSuccess: () => invalidateProfileAttributes(queryClient),
  })
}

export function useDeleteProfileAttribute(attributeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth(`/api/workspaces/profile-attributes/${attributeId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(await readError(response, '属性を削除できませんでした'))
    },
    onSuccess: () => invalidateProfileAttributes(queryClient),
  })
}

export function useUpdateMemberProfileAttributes(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (attributeIds: string[]) => {
      const response = await fetchWithAuth(`/api/workspaces/members/${userId}/profile-attributes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributeIds }),
      })
      const body = await response.json() as {
        error?: string
        profileAttributes?: ProfileAttributeDto[]
      }
      if (!response.ok || !body.profileAttributes) {
        throw new Error(body.error ?? '属性の保存に失敗しました')
      }
      return body.profileAttributes
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
      void queryClient.invalidateQueries({ queryKey: ['messages'] })
    },
  })
}
