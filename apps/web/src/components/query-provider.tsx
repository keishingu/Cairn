// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // staleTime を長めに取り、数分程度のタブ離脱では focus 復帰時に再取得しない。
            // staleTime が短いと、放置後にタブへ戻った瞬間アクティブなクエリが一斉に stale 化して
            // refetchOnWindowFocus が全クエリを同時再取得し、その帯域が初回クリックの遷移と競合して
            // 「放置後の初回遷移だけ遅い」体感になっていた。長時間放置の本当の catch-up は下記で担保する。
            // メッセージ・通知など Realtime 取りこぼし時に focus refetch が唯一の catch-up 経路になる
            // クエリは、この既定値より短い staleTime を個別指定している（useChannelMessages 等）。
            staleTime: 5 * 60 * 1000,
            // Realtime 切断中のスリープ/タブ復帰時に取りこぼしを回収する（ポーリング廃止に伴う catch-up）。
            // staleTime を超える離脱でのみ発火するため、短時間離脱ではバーストしない。
            refetchOnWindowFocus: true,
          },
        },
      }),
  )

  // ログアウト時に前アカウントのキャッシュ（プロジェクト一覧・チャット一覧など）が
  // 残り、別アカウントでログインしても切り替わらないため、SIGNED_OUT で一括破棄する。
  // queryKey にユーザー ID を含めない方針のため、サインアウトを唯一の境界として扱う。
  useEffect(() => {
    const supabase = createClient()
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') queryClient.clear()
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
