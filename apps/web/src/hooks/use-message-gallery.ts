// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '@/components/locale-provider'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { toast } from '@/lib/toast'
import type {
  MessageGalleryAddResponse,
  MessageGalleryStatusResponse,
} from '@/app/api/messages/[messageId]/gallery/route'

export function projectGalleryHref(projectId: string): string {
  return `/projects?open=project-${encodeURIComponent(projectId)}&tab=gallery`
}

/**
 * チャットのメッセージの画像を、プロジェクトのギャラリーへ追加する。
 * 成否はトーストで知らせ、追加できたらギャラリーの一覧を取り直す。
 */
export function useMessageGallery() {
  const t = useT()
  const queryClient = useQueryClient()

  /** 追加済みの画像を取得する。失敗したらトーストで知らせて null を返す */
  const fetchStatus = React.useCallback(async (messageId: string): Promise<MessageGalleryStatusResponse | null> => {
    try {
      const res = await fetchWithAuth(`/api/messages/${messageId}/gallery`)
      const body = await res.json().catch(() => null) as (Partial<MessageGalleryStatusResponse> & { error?: unknown }) | null
      if (!res.ok || typeof body?.projectId !== 'string' || !Array.isArray(body.addedFileIds)) {
        toast.error(typeof body?.error === 'string' ? body.error : t('Could not add to the gallery'))
        return null
      }
      return { projectId: body.projectId, addedFileIds: body.addedFileIds }
    } catch {
      toast.error(t('Could not add to the gallery'))
      return null
    }
  }, [t])

  /** 選んだ画像を追加する。成功したら true */
  const addImages = React.useCallback(async (messageId: string, fileIds: string[]): Promise<boolean> => {
    try {
      const res = await fetchWithAuth(`/api/messages/${messageId}/gallery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds }),
      })
      const body = await res.json().catch(() => null) as (Partial<MessageGalleryAddResponse> & { error?: unknown }) | null
      if (!res.ok || typeof body?.projectId !== 'string' || typeof body.addedCount !== 'number') {
        toast.error(typeof body?.error === 'string' ? body.error : t('Could not add to the gallery'))
        return false
      }
      const message = body.addedCount === 0
        ? t('Already in the gallery')
        : body.addedCount === 1
          ? t('Added to the gallery')
          : t('Added {count} photos to the gallery', { count: body.addedCount })
      toast.success(message, { action: { label: t('Open'), href: projectGalleryHref(body.projectId) } })
      void queryClient.invalidateQueries({ queryKey: ['project-gallery', body.projectId] })
      void queryClient.invalidateQueries({ queryKey: ['workspace-gallery'] })
      return true
    } catch {
      toast.error(t('Could not add to the gallery'))
      return false
    }
  }, [queryClient, t])

  return { fetchStatus, addImages }
}
