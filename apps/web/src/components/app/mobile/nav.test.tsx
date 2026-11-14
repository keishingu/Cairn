// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MobileNav } from './nav'

const { navState } = vi.hoisted(() => ({
  navState: { wsRole: undefined as string | undefined, aiChatAccess: undefined as string | undefined },
}))

vi.mock('@/lib/use-workspace-settings', () => ({
  useProjectLabel: () => 'プロジェクト',
  useWorkspaceSettings: () => ({ data: navState.aiChatAccess ? { aiChatAccess: navState.aiChatAccess } : undefined }),
}))

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn(async (url: string) => {
    if (url === '/api/me') {
      return new Response(JSON.stringify({ displayName: 'テストユーザー', avatarUrl: null, wsRole: navState.wsRole }))
    }
    if (url === '/api/workspaces') {
      return new Response(JSON.stringify({ name: 'テストワークスペース', logoUrl: null }))
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }),
}))

function renderMobileNav() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const onNavigate = vi.fn()

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MobileNav
        page="projects"
        projectsView="list"
        onNavigate={onNavigate}
        onChangeView={vi.fn()}
      />
    </QueryClientProvider>,
  )

  return { ...result, onNavigate }
}

describe('MobileNav', () => {
  it('チャットを左端に表示して /chats へ遷移する', async () => {
    const { onNavigate } = renderMobileNav()
    const chatTab = screen.getByRole('button', { name: 'チャット' })

    expect(chatTab.parentElement?.firstElementChild).toBe(chatTab)
    await userEvent.click(chatTab)
    expect(onNavigate).toHaveBeenCalledWith('/chats')
  })

  it('プロジェクト表示切替を左右のセーフエリア内に配置する', async () => {
    renderMobileNav()

    await userEvent.click(screen.getByRole('button', { name: /プロジェクト/ }))

    const picker = screen.getByRole('button', { name: '一覧' }).parentElement
    expect(picker).toHaveStyle({ left: 'calc(8px + env(safe-area-inset-left))' })
  })

  it('メニューを左右のセーフエリア内に配置する', async () => {
    renderMobileNav()

    await userEvent.click(screen.getByRole('button', { name: /メニュー/ }))

    const menu = screen.getByRole('button', { name: 'ファイル' }).parentElement
    expect(menu).toHaveStyle({
      left: 'calc(12px + env(safe-area-inset-left))',
      right: 'calc(12px + env(safe-area-inset-right))',
    })
  })

  it('owner が AI アシスタントを管理者以上に絞っていれば、member には AI のタブを出さない', async () => {
    navState.wsRole = 'member'
    navState.aiChatAccess = 'admin'
    try {
      renderMobileNav()

      expect(await screen.findByRole('button', { name: /チャット|Chats/ })).toBeInTheDocument()
      await vi.waitFor(() => expect(screen.queryByRole('button', { name: /^AI$/ })).not.toBeInTheDocument())
    } finally {
      navState.wsRole = undefined
      navState.aiChatAccess = undefined
    }
  })

  it('設定を読み込む前は AI のタブを隠さない', () => {
    renderMobileNav()

    expect(screen.getByRole('button', { name: /^AI$/ })).toBeInTheDocument()
  })
})
