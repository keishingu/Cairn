// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { CurrentUserDto } from '@/app/api/me/route'
import { PostHogUserIdentity } from './posthog-user-identity'

const mocks = vi.hoisted(() => ({
  identify: vi.fn(),
  useCurrentUser: vi.fn(),
}))

vi.mock('@/lib/posthog', () => ({
  isPostHogConfigured: true,
  posthog: { identify: mocks.identify },
}))

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: mocks.useCurrentUser,
}))

const user: CurrentUserDto = {
  id: 'user-1',
  displayName: '山田 太郎',
  avatarUrl: null,
  email: 'taro@example.com',
  bio: null,
  status: 'online',
  statusMessage: null,
  wsRole: 'member',
  aiNudgesEnabled: true,
  theme: 'system',
  accentId: 'emerald',
}

describe('PostHogUserIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('ユーザー取得前は識別しない', () => {
    mocks.useCurrentUser.mockReturnValue({ data: undefined })

    render(<PostHogUserIdentity />)

    expect(mocks.identify).not.toHaveBeenCalled()
  })

  test('認証済みユーザーを安定したIDとプロフィールで識別する', async () => {
    mocks.useCurrentUser.mockReturnValue({ data: user })

    render(<PostHogUserIdentity />)

    await waitFor(() => {
      expect(mocks.identify).toHaveBeenCalledWith('user-1', {
        email: 'taro@example.com',
        name: '山田 太郎',
        workspace_role: 'member',
      })
    })
  })
})
