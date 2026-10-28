// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AutomationDto, AutomationWriteAction } from '@/lib/ai/automations'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

const QUERY_KEY = ['ai-automations'] as const

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null
  return body?.error ?? fallback
}

export type AutomationInput = { name: string; instruction: string; writeActions: AutomationWriteAction[] }

export function useAutomations() {
  return useQuery<AutomationDto[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetchWithAuth('/api/automations')
      if (!response.ok) throw new Error(await readError(response, 'オートメーションを取得できませんでした'))
      return response.json() as Promise<AutomationDto[]>
    },
  })
}

export function useCreateAutomation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: AutomationInput) => {
      const response = await fetchWithAuth('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'skill', ...input }),
      })
      if (!response.ok) throw new Error(await readError(response, 'オートメーションを作成できませんでした'))
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useUpdateAutomation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<AutomationInput> & { enabled?: boolean }) => {
      const response = await fetchWithAuth(`/api/automations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) throw new Error(await readError(response, 'オートメーションを更新できませんでした'))
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useDeleteAutomation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth(`/api/automations/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(await readError(response, 'オートメーションを削除できませんでした'))
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
