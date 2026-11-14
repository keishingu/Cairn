// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MobileHeader } from './header'

vi.mock('@/lib/notifications/client', () => ({
  useUnreadNotificationCount: () => 0,
}))

function renderMobileHeader() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(['workspace'], {
    id: 'workspace-1',
    name: 'テストワークスペース',
    logoUrl: null,
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MobileHeader title="プロジェクト" />
    </QueryClientProvider>,
  )
}

describe('MobileHeader', () => {
  it('ヘッダー操作を上下左右のセーフエリア内に配置する', () => {
    renderMobileHeader()

    expect(screen.getByRole('banner')).toHaveStyle({
      paddingTop: 'max(10px, env(safe-area-inset-top))',
      paddingLeft: 'calc(16px + env(safe-area-inset-left))',
      paddingRight: 'calc(16px + env(safe-area-inset-right))',
    })
  })
})
