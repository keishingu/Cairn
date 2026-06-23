import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectFileDto } from '@/app/api/projects/[id]/files/route'

export function useProjectFiles(projectId: string) {
  const queryClient = useQueryClient()

  const query = useQuery<ProjectFileDto[]>({
    queryKey: ['project-files', projectId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/projects/${projectId}/files`)
      if (!res.ok) throw new Error('Failed to fetch files')
      return res.json() as Promise<ProjectFileDto[]>
    },
    // pending なリンクがある間は 3 秒ごとに再フェッチして名前・ステータスを最新化
    refetchInterval: (q) => {
      const data = q.state.data
      return Array.isArray(data) && data.some(f => f.indexingStatus === 'pending') ? 3000 : false
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) =>
      fetchWithAuth(`/api/attachments/${fileId}`, { method: 'DELETE' }).then(r => {
        if (!r.ok) throw new Error('削除に失敗しました')
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-files', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })

  const setLatestMutation = useMutation({
    mutationFn: ({ fileId, isLatest }: { fileId: string; isLatest: boolean }) =>
      fetchWithAuth(`/api/attachments/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLatest }),
      }).then(r => {
        if (!r.ok) throw new Error('最新版の更新に失敗しました')
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-files', projectId] })
    },
  })

  return { ...query, deleteMutation, setLatestMutation }
}
