// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query'
import type { UploadRightsDto } from '@/app/api/billing/upload-rights/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

/**
 * 自分が動画を送れるか・原本を取得できるか（Solo 支援者本人、または課金無効）。
 * メニューの出し分けだけに使い、判定の正はサーバーの 403。読み込み中・失敗時は undefined
 */
export function useUploadRights(): UploadRightsDto | undefined {
  const { data } = useQuery<UploadRightsDto>({
    queryKey: ['upload-rights'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/billing/upload-rights')
      if (!res.ok) throw new Error('Failed to fetch upload rights')
      return res.json() as Promise<UploadRightsDto>
    },
    staleTime: 60_000,
  })
  return data
}
