// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// AIアシスタントの会話の一覧・会話の中身・新しい会話の作成。
// 取得に失敗したら、エラーの中身を会話として扱ったり、黙って最初の画面に戻したりせず、エラーとして返す

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ConversationDto } from '@/app/api/ai/conversations/route'
import type { MessageDto } from '@/app/api/ai/conversations/[id]/messages/route'
import { useT } from '@/components/locale-provider'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { toast } from '@/lib/toast'

// 4xx はサーバーが利用者向けの理由（日本語）を返すのでそれを出し、5xx は内部のエラー（英語）なので決まった文言を出す
async function readJson<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = res.status < 500 ? ((await res.json().catch(() => null)) as { error?: unknown } | null) : null
    throw new Error(typeof body?.error === 'string' ? body.error : fallback)
  }
  return (await res.json()) as T
}

export function useAiConversations() {
  const t = useT()
  return useQuery<ConversationDto[]>({
    queryKey: ['ai-conversations'],
    queryFn: async () => readJson(await fetchWithAuth('/api/ai/conversations'), t('Could not load conversations')),
  })
}

export function useAiConversationMessages(conversationId: string | null) {
  const t = useT()
  return useQuery<MessageDto[]>({
    queryKey: ['ai-messages', conversationId],
    queryFn: async () => readJson(await fetchWithAuth(`/api/ai/conversations/${conversationId}/messages`), t('Could not load the conversation')),
    enabled: !!conversationId,
  })
}

/** 新しい会話を作る。作れなかったらトーストで知らせる（ボタン操作の結果のため） */
export function useCreateAiConversation(onCreated: (conversation: ConversationDto) => void) {
  const t = useT()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => readJson<ConversationDto>(
      await fetchWithAuth('/api/ai/conversations', { method: 'POST' }),
      t('Could not start a new conversation'),
    ),
    onSuccess: conversation => {
      queryClient.setQueryData<ConversationDto[]>(['ai-conversations'], prev => [conversation, ...(prev ?? [])])
      onCreated(conversation)
    },
    onError: error => toast.error(error.message),
  })
}
