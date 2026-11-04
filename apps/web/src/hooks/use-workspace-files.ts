// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import React from 'react'
import { useT } from '@/components/locale-provider'
import type { FileListResponse } from '@/app/api/files/route'
import type { FileFacetsResponse } from '@/app/api/files/facets/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

/**
 * ワークスペースのファイル一覧（/files）。サーバーがページ分割するため、末尾まで来たら `fetchNextPage` で続きを読む。
 * `listParams` は `buildFileListSearchParams()` で作った絞り込み条件のクエリ文字列。
 */
export function useWorkspaceFileList(listParams: string) {
  const t = useT()
  const query = useInfiniteQuery({
    queryKey: ['files', 'list', listParams],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams(listParams)
      if (pageParam) params.set('cursor', pageParam)
      const res = await fetchWithAuth(`/api/files?${params.toString()}`)
      if (!res.ok) throw new Error(t('Could not load files ({status})', { status: res.status }))
      return res.json() as Promise<FileListResponse>
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: keepPreviousData,
  })
  const files = React.useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  )
  return { ...query, files, loadedPageCount: query.data?.pages.length ?? 0 }
}

/** 種類別件数・絞り込みの選択肢・プロジェクト別件数（未読み込みのページも含めた集計） */
export function useWorkspaceFileFacets(listParams: string) {
  const t = useT()
  return useQuery<FileFacetsResponse>({
    queryKey: ['files', 'facets', listParams],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/files/facets?${listParams}`)
      if (!res.ok) throw new Error(t('Could not load files ({status})', { status: res.status }))
      return res.json() as Promise<FileFacetsResponse>
    },
    placeholderData: keepPreviousData,
  })
}

export function useDeleteWorkspaceFile() {
  const t = useT()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fileId: string) =>
      fetchWithAuth(`/api/attachments/${fileId}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error(t('Could not delete the file'))
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['files'] })
      void queryClient.invalidateQueries({ queryKey: ['project-files'] })
    },
  })
}

export function useReindexWorkspaceFile() {
  const t = useT()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fileId: string) =>
      fetchWithAuth(`/api/attachments/${fileId}/reindex`, { method: 'POST' }).then((r) => {
        if (!r.ok) throw new Error(t('Could not reindex the file'))
      }),
    // 一覧はページ分割（useInfiniteQuery）なので、ページごとに書き換える
    onMutate: (fileId: string) => {
      queryClient.setQueriesData<InfiniteData<FileListResponse>>(
        { queryKey: ['files', 'list'] },
        (prev) =>
          prev && {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              items: page.items.map((f) =>
                f.id === fileId ? { ...f, indexingStatus: 'pending' } : f,
              ),
            })),
          },
      )
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['files'] }),
  })
}

/** テキストファイルのプレビュー本文。`fileId` が null の間は取得しない */
export function useFileTextPreview(fileId: string | null) {
  const t = useT()
  return useQuery<string>({
    queryKey: ['attachment-text-preview', fileId],
    enabled: fileId !== null,
    queryFn: async () => {
      if (!fileId) throw new Error(t('No text file to preview'))
      const res = await fetchWithAuth(`/api/attachments/${fileId}`)
      if (!res.ok) throw new Error(t('Could not fetch the text preview'))
      return res.text()
    },
  })
}
