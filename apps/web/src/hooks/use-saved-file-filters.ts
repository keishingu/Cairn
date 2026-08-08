// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { toast } from '@/lib/toast'
import type { FileFilterConditions, SavedFileFilterDto } from '@/lib/files/saved-file-filter'

export const savedFileFilterQueryKey = ['saved-file-filters'] as const

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  return new Error(typeof body?.error === 'string' ? body.error : fallback)
}

export function useSavedFileFilters() {
  const queryClient = useQueryClient()

  const query = useQuery<SavedFileFilterDto[]>({
    queryKey: savedFileFilterQueryKey,
    queryFn: async () => {
      const response = await fetchWithAuth('/api/files/filters')
      if (!response.ok)
        throw await responseError(response, '保存済みフィルターの取得に失敗しました')
      return response.json() as Promise<SavedFileFilterDto[]>
    },
  })

  const createMutation = useMutation({
    mutationFn: async ({
      name,
      conditions,
    }: {
      name: string
      conditions: FileFilterConditions
    }) => {
      const response = await fetchWithAuth('/api/files/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, conditions }),
      })
      if (!response.ok) throw await responseError(response, 'フィルターの保存に失敗しました')
      return response.json() as Promise<SavedFileFilterDto>
    },
    onSuccess: (created) => {
      queryClient.setQueryData<SavedFileFilterDto[]>(savedFileFilterQueryKey, (current) => [
        ...(current ?? []),
        created,
      ])
      toast.success('フィルターを保存しました')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'フィルターの保存に失敗しました'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (filterId: string) => {
      const response = await fetchWithAuth(`/api/files/filters/${filterId}`, { method: 'DELETE' })
      if (!response.ok) throw await responseError(response, 'フィルターの削除に失敗しました')
      return filterId
    },
    onSuccess: (filterId) => {
      queryClient.setQueryData<SavedFileFilterDto[]>(
        savedFileFilterQueryKey,
        (current) => current?.filter((filter) => filter.id !== filterId) ?? [],
      )
      toast.success('フィルターを削除しました')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'フィルターの削除に失敗しました'),
  })

  return { ...query, createMutation, deleteMutation }
}
