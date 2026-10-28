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

// 認証（getAuthContext）が返す内部の文言。利用者向けではないため、そのまま出さずに訳した文言に置き換える
const AUTH_CONTEXT_ERRORS = new Set(['Unauthorized', 'No workspace found', 'OAuth token does not have the required scope'])

/**
 * レスポンスを読む。失敗したときは、利用者に見せられる理由のエラーにする。
 * - 401: ログインが切れた
 * - 403 で認証の内部の文言: このワークスペースを使えない（権限を説明する日本語の 403 はそのまま出す）
 * - その他の 4xx: サーバーが返す利用者向けの理由
 * - 5xx: 内部のエラー（英語）なので決まった文言
 */
async function readJson<T>(res: Response, fallback: string, t: ReturnType<typeof useT>): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) throw new Error(t('Your session has expired. Please sign in again.'))
    const body = res.status < 500 ? ((await res.json().catch(() => null)) as { error?: unknown } | null) : null
    const message = typeof body?.error === 'string' ? body.error : null
    if (res.status === 403 && (!message || AUTH_CONTEXT_ERRORS.has(message))) {
      throw new Error(t('You cannot use this workspace. Check that you are still a member.'))
    }
    throw new Error(message && !AUTH_CONTEXT_ERRORS.has(message) ? message : fallback)
  }
  return (await res.json()) as T
}

export function useAiConversations() {
  const t = useT()
  return useQuery<ConversationDto[]>({
    queryKey: ['ai-conversations'],
    queryFn: async () => readJson(await fetchWithAuth('/api/ai/conversations'), t('Could not load conversations'), t),
  })
}

export function useAiConversationMessages(conversationId: string | null) {
  const t = useT()
  return useQuery<MessageDto[]>({
    queryKey: ['ai-messages', conversationId],
    queryFn: async () => readJson(await fetchWithAuth(`/api/ai/conversations/${conversationId}/messages`), t('Could not load the conversation'), t),
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
      t,
    ),
    onSuccess: conversation => {
      queryClient.setQueryData<ConversationDto[]>(['ai-conversations'], prev => [conversation, ...(prev ?? [])])
      onCreated(conversation)
    },
    onError: error => toast.error(error.message),
  })
}
