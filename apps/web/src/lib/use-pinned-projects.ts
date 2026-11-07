import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from './fetch-with-auth'
import type { PinnedProjectDto } from '@/app/api/projects/pinned/route'

/** 失敗を成功扱いにしない。呼び出し側が onError で利用者へ見せられるよう、API のエラー文を投げる */
async function throwUnlessOk(res: Response, fallback = 'ピン留めを更新できませんでした'): Promise<Response> {
  if (res.ok) return res
  const body = await res.json().catch(() => null) as { error?: unknown } | null
  throw new Error(typeof body?.error === 'string' ? body.error : `${fallback}（${res.status}）`)
}

export function usePinnedProjects() {
  return useQuery<PinnedProjectDto[]>({
    queryKey: ['pinned-projects'],
    // エラー応答（{ error }）を一覧として扱わない。失敗は query のエラーにして呼び出し側で表示する
    queryFn: () => fetchWithAuth('/api/projects/pinned')
      .then(res => throwUnlessOk(res, 'ピン留めしたプロジェクトを読み込めませんでした'))
      .then(res => res.json() as Promise<PinnedProjectDto[]>),
    staleTime: 30_000,
  })
}

export function usePinProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      fetchWithAuth('/api/projects/pinned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      }).then(res => throwUnlessOk(res)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pinned-projects'] }) },
  })
}

export function useUnpinProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      fetchWithAuth('/api/projects/pinned', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      }).then(res => throwUnlessOk(res)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pinned-projects'] }) },
  })
}
