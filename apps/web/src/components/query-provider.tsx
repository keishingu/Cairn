// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

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

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
