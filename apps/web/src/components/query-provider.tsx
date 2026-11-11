// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isPostHogConfigured, posthog } from '@/lib/posthog'
import { refetchOnWindowFocus } from '@/lib/realtime-focus'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            // Realtime が invalidate するクエリだけ、接続中のフォーカス再取得を止める。
            // それ以外（ファイル一覧など）はタブ復帰で取り直す。切断中は全部取り直す。
            refetchOnWindowFocus,
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
