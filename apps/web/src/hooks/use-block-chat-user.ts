// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'
import { useT } from '@/components/locale-provider'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

export function useBlockChatUser() {
  const queryClient = useQueryClient()
  const t = useT()
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetchWithAuth('/api/me/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error ?? t('Could not block the user'))
      }
    },
    onSuccess: async (_data, userId) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['messages'] }),
        queryClient.cancelQueries({ queryKey: ['message-history'] }),
      ])
      // 再取得が遅延・失敗しても、ブロックした相手の添付を画面に残さない。
      const hideBlocked = (current: MessageDto[] | undefined) => current?.map(message =>
        message.senderId === userId ? { ...message, blocked: true, attachments: [] } : message,
      )
      queryClient.setQueriesData<MessageDto[]>({ queryKey: ['messages'] }, hideBlocked)
      queryClient.setQueriesData<MessageDto[]>({ queryKey: ['message-history'] }, hideBlocked)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['messages'] }),
        queryClient.invalidateQueries({ queryKey: ['message-history'] }),
        queryClient.invalidateQueries({ queryKey: ['dms'] }),
        queryClient.invalidateQueries({ queryKey: ['user-blocks'] }),
      ])
    },
  })
}
