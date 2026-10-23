// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_FLAGS } from '@cairn/shared'
import { GET, POST } from './route'
import { getAuthContext } from '@/lib/get-auth-context'

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: vi.fn(),
}))

const originalDmFlag = FEATURE_FLAGS.dm

describe('/api/workspaces/dms', () => {
  beforeEach(() => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = false
  })

  afterEach(() => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = originalDmFlag
    vi.clearAllMocks()
  })

  it('feature flag が無効なら一覧取得を認証前に 404 にする', async () => {
    const response = await GET()

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'DM機能は現在利用できません' })
    expect(getAuthContext).not.toHaveBeenCalled()
  })

  it('feature flag が無効なら作成を認証前に 404 にする', async () => {
    const response = await POST(new Request('http://localhost/api/workspaces/dms', { method: 'POST' }))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'DM機能は現在利用できません' })
    expect(getAuthContext).not.toHaveBeenCalled()
  })
})
