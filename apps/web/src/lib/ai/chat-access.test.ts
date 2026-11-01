// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test, vi } from 'vitest'

const { selectResult } = vi.hoisted(() => ({ selectResult: { rows: [] as unknown[] } }))

vi.mock('@cairn/db', () => {
  const chain: Record<string, unknown> = {}
  for (const name of ['from', 'where']) chain[name] = () => chain
  chain['limit'] = async () => selectResult.rows
  return { db: { select: () => chain }, workspaces: { id: 'id', aiChatAccess: 'aiChatAccess' } }
})
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }))

import { requireAiChatAccess } from './chat-access'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000010'

describe('requireAiChatAccess', () => {
  afterEach(() => {
    selectResult.rows = []
  })

  test('「メンバーも可」ならゲストも使える', async () => {
    selectResult.rows = [{ aiChatAccess: 'member' }]

    expect(await requireAiChatAccess({ workspaceId: WORKSPACE_ID, role: 'guest' })).toBeNull()
  })

  test('「管理者以上」なら member は 403 で、理由のロールを示す', async () => {
    selectResult.rows = [{ aiChatAccess: 'admin' }]

    expect(await requireAiChatAccess({ workspaceId: WORKSPACE_ID, role: 'admin' })).toBeNull()
    const denied = await requireAiChatAccess({ workspaceId: WORKSPACE_ID, role: 'member' })
    expect(denied?.status).toBe(403)
    await expect(denied?.json()).resolves.toEqual({
      error: 'このワークスペースでは、AIアシスタントは管理者以上（owner・admin）だけが利用できます。',
    })
  })

  test('「オーナーのみ」なら admin も 403 にする', async () => {
    selectResult.rows = [{ aiChatAccess: 'owner' }]

    expect(await requireAiChatAccess({ workspaceId: WORKSPACE_ID, role: 'owner' })).toBeNull()
    expect((await requireAiChatAccess({ workspaceId: WORKSPACE_ID, role: 'admin' }))?.status).toBe(403)
  })

  test('設定が読めない・不正なときは全員に許可へ戻さず 500 にする', async () => {
    selectResult.rows = [{ aiChatAccess: 'everyone' }]
    expect((await requireAiChatAccess({ workspaceId: WORKSPACE_ID, role: 'owner' }))?.status).toBe(500)

    selectResult.rows = []
    expect((await requireAiChatAccess({ workspaceId: WORKSPACE_ID, role: 'owner' }))?.status).toBe(500)
  })
})
