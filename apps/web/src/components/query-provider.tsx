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
            staleTime: 60 * 1000,
            // Realtime 切断中のスリープ/タブ復帰時に取りこぼしを回収する（ポーリング廃止に伴う catch-up）
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
