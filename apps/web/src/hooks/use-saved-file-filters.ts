// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { toast } from '@/lib/toast'
import { useT } from '@/components/locale-provider'
import type { FileFilterConditions, SavedFileFilterDto } from '@/lib/files/saved-file-filter'

export const savedFileFilterQueryKey = ['saved-file-filters'] as const

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  return new Error(typeof body?.error === 'string' ? body.error : fallback)
}

export function useSavedFileFilters() {
  const queryClient = useQueryClient()
  const t = useT()

  const query = useQuery<SavedFileFilterDto[]>({
    queryKey: savedFileFilterQueryKey,
    queryFn: async () => {
      const response = await fetchWithAuth('/api/files/filters')
      if (!response.ok)
        throw await responseError(response, t('Could not load saved filters'))
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
      if (!response.ok) throw await responseError(response, t('Could not save the filter'))
      return response.json() as Promise<SavedFileFilterDto>
    },
    onSuccess: (created) => {
      queryClient.setQueryData<SavedFileFilterDto[]>(savedFileFilterQueryKey, (current) => [
        ...(current ?? []),
        created,
      ])
      toast.success(t('Saved the filter'))
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('Could not save the filter')),
  })

  const deleteMutation = useMutation({
    mutationFn: async (filterId: string) => {
      const response = await fetchWithAuth(`/api/files/filters/${filterId}`, { method: 'DELETE' })
      if (!response.ok) throw await responseError(response, t('Could not delete the filter'))
      return filterId
    },
    onSuccess: (filterId) => {
      queryClient.setQueryData<SavedFileFilterDto[]>(
        savedFileFilterQueryKey,
        (current) => current?.filter((filter) => filter.id !== filterId) ?? [],
      )
      toast.success(t('Deleted the filter'))
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('Could not delete the filter')),
  })

  return { ...query, createMutation, deleteMutation }
}
