// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isPostHogConfigured, posthog } from '@/lib/posthog'
import { recordQueryFetchSuccess, refetchOnWindowFocus } from '@/lib/realtime-focus'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            // Realtime 切断中はタブ復帰のたびに取りこぼしを回収する。接続中は Broadcast が
            // 表示中のデータを更新するので、最後の取得から 5 分を過ぎたクエリだけ取り直す。
            refetchOnWindowFocus,
          },
        },
      }),
  )

  // タブ復帰の判定に使う「最後にサーバーから取得した時刻」を記録する
  useEffect(
    () => queryClient.getQueryCache().subscribe((event) => recordQueryFetchSuccess(event)),
    [queryClient],
  )

  // ログアウト時に前アカウントのキャッシュ（プロジェクト一覧・チャット一覧など）が
  // 残り、別アカウントでログインしても切り替わらないため、SIGNED_OUT で一括破棄する。
  // queryKey にユーザー ID を含めない方針のため、サインアウトを唯一の境界として扱う。
  useEffect(() => {
    const supabase = createClient()
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        queryClient.clear()
        if (isPostHogConfigured) posthog.reset()
      }
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
