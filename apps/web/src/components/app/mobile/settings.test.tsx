// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileSettings } from './settings'
import type { CurrentUserDto } from '@/app/api/me/route'
import type { WorkspaceDto } from '@/app/api/workspaces/route'

const mockPush = vi.fn()
const mockSignOut = vi.fn().mockResolvedValue(undefined)
const mockSyncPresenceOfflineOnLogout = vi.fn().mockResolvedValue('offline')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('./header', () => ({
  MobileHeader: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../pages/settings', () => ({
  getSettingsNavGroups: () => [],
  SettingsSectionContent: () => null,
  isSettingsSection: () => true,
  settingsSectionLabel: () => '設定',
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
}))

vi.mock('@/lib/use-auto-presence', () => ({
  syncPresenceOfflineOnLogout: (...args: unknown[]) => mockSyncPresenceOfflineOnLogout(...args),
}))

const CURRENT_USER: CurrentUserDto = {
  id: 'user-1',
  email: 'kei@example.com',
  displayName: 'Kei',
  avatarUrl: null,
  bio: null,
  wsRole: 'owner',
  status: 'online',
  statusMessage: null,
}

const WORKSPACE: WorkspaceDto = {
  id: 'ws-1',
  name: 'Cairn',
  slug: 'cairn',
  description: null,
  logoUrl: null,
}

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  queryClient.setQueryData(['me'], CURRENT_USER)
  queryClient.setQueryData(['workspace'], WORKSPACE)

  return render(
    <QueryClientProvider client={queryClient}>
      <MobileSettings />
    </QueryClientProvider>,
  )
}

describe('MobileSettings', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockSignOut.mockClear()
    mockSyncPresenceOfflineOnLogout.mockClear()
  })

  it('ログアウト時に workspace id を付けて presence を offline に同期する', async () => {
    renderSettings()

    await userEvent.click(screen.getByRole('button', { name: 'ログアウト' }))

    expect(mockSyncPresenceOfflineOnLogout).toHaveBeenCalledWith('ws-1')
    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(mockPush).toHaveBeenCalledWith('/auth/login')
  })
})
