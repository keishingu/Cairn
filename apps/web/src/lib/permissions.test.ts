// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi, beforeEach } from 'vitest'

// DB モック（vi.hoisted でモジュール評価前に確定させる）
const { mockDb } = vi.hoisted(() => {
  const mockDb = { select: vi.fn() }
  return { mockDb }
})

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers: { userId: 'wm.userId', workspaceId: 'wm.workspaceId', role: 'wm.role' },
  channels: { id: 'ch.id', isPrivate: 'ch.isPrivate', type: 'ch.type', projectId: 'ch.projectId', workspaceId: 'ch.workspaceId' },
  channelMembers: { channelId: 'cm.channelId', userId: 'cm.userId' },
  projects: { id: 'p.id', workspaceId: 'p.workspaceId' },
  projectMembers: { id: 'pm.id', projectId: 'pm.projectId', userId: 'pm.userId' },
  messages: { id: 'msg.id', channelId: 'msg.channelId' },
  messageAttachments: { messageId: 'ma.messageId', fileId: 'ma.fileId' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  sql: vi.fn(),
}))

// チェーン構築ヘルパー
function selectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    leftJoin: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.leftJoin.mockReturnValue(chain)
  chain.innerJoin.mockReturnValue(chain)
  return chain
}

import {
  isWorkspaceOwner,
  isWorkspaceAdmin,
  isWorkspaceMember,
  requireWorkspaceOwner,
  requireWorkspaceAdmin,
  requireWorkspaceMember,
  requireProjectAccess,
} from './permissions'

describe('isWorkspaceOwner', () => {
  it('owner のみ true', () => {
    expect(isWorkspaceOwner('owner')).toBe(true)
    expect(isWorkspaceOwner('admin')).toBe(false)
    expect(isWorkspaceOwner('member')).toBe(false)
    expect(isWorkspaceOwner('guest')).toBe(false)
    expect(isWorkspaceOwner(null)).toBe(false)
  })
})

describe('isWorkspaceAdmin', () => {
  it('owner と admin が true', () => {
    expect(isWorkspaceAdmin('owner')).toBe(true)
    expect(isWorkspaceAdmin('admin')).toBe(true)
    expect(isWorkspaceAdmin('member')).toBe(false)
    expect(isWorkspaceAdmin('guest')).toBe(false)
    expect(isWorkspaceAdmin(null)).toBe(false)
  })
})

describe('isWorkspaceMember', () => {
  it('owner・admin・member が true、guest は false', () => {
    expect(isWorkspaceMember('owner')).toBe(true)
    expect(isWorkspaceMember('admin')).toBe(true)
    expect(isWorkspaceMember('member')).toBe(true)
    expect(isWorkspaceMember('guest')).toBe(false)
    expect(isWorkspaceMember(null)).toBe(false)
  })
})

describe('requireWorkspaceOwner', () => {
  beforeEach(() => vi.clearAllMocks())

  it('owner ロールは null（許可）を返す', async () => {
    mockDb.select.mockReturnValue(selectChain([{ role: 'owner' }]))
    const result = await requireWorkspaceOwner('ws-1', 'user-1')
    expect(result).toBeNull()
  })

  it('admin は 403 を返す', async () => {
    mockDb.select.mockReturnValue(selectChain([{ role: 'admin' }]))
    const result = await requireWorkspaceOwner('ws-1', 'user-1')
    expect(result).not.toBeNull()
    const json = await result!.json()
    expect(result!.status).toBe(403)
    expect(json.error).toMatch(/オーナー/)
  })

  it('ロールなし（非メンバー）は 403 を返す', async () => {
    mockDb.select.mockReturnValue(selectChain([]))
    const result = await requireWorkspaceOwner('ws-1', 'user-1')
    expect(result).not.toBeNull()
    expect(result!.status).toBe(403)
  })
})

describe('requireWorkspaceAdmin', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['owner', 'admin'] as const)('%s は null（許可）を返す', async (role) => {
    mockDb.select.mockReturnValue(selectChain([{ role }]))
    const result = await requireWorkspaceAdmin('ws-1', 'user-1')
    expect(result).toBeNull()
  })

  it.each(['member', 'guest'] as const)('%s は 403 を返す', async (role) => {
    mockDb.select.mockReturnValue(selectChain([{ role }]))
    const result = await requireWorkspaceAdmin('ws-1', 'user-1')
    expect(result).not.toBeNull()
    expect(result!.status).toBe(403)
    const json = await result!.json()
    expect(json.error).toMatch(/管理者/)
  })
})

describe('requireWorkspaceMember', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['owner', 'admin', 'member'] as const)('%s は null（許可）を返す', async (role) => {
    mockDb.select.mockReturnValue(selectChain([{ role }]))
    const result = await requireWorkspaceMember('ws-1', 'user-1')
    expect(result).toBeNull()
  })

  it('guest は 403 を返す', async () => {
    mockDb.select.mockReturnValue(selectChain([{ role: 'guest' }]))
    const result = await requireWorkspaceMember('ws-1', 'user-1')
    expect(result).not.toBeNull()
    expect(result!.status).toBe(403)
    const json = await result!.json()
    expect(json.error).toMatch(/ゲスト/)
  })

  it('ロールなしは 403 を返す', async () => {
    mockDb.select.mockReturnValue(selectChain([]))
    const result = await requireWorkspaceMember('ws-1', 'user-1')
    expect(result).not.toBeNull()
    expect(result!.status).toBe(403)
  })
})

describe('requireProjectAccess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('member 以上はプロジェクトメンバーシップを確認せず許可する', async () => {
    mockDb.select.mockReturnValue(selectChain([{ role: 'member' }]))
    const result = await requireProjectAccess('ws-1', 'user-1', 'project-1')
    expect(result).toBeNull()
    // DB.select は 1 回（role 取得）だけ呼ばれる
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })

  it('guest で project_members に行がある場合は許可する', async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ role: 'guest' }]))     // role 取得
      .mockReturnValueOnce(selectChain([{ id: 'pm-1' }]))        // project membership 確認
    const result = await requireProjectAccess('ws-1', 'user-1', 'project-1')
    expect(result).toBeNull()
  })

  it('guest でプロジェクト未参加は 403 を返す', async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ role: 'guest' }]))
      .mockReturnValueOnce(selectChain([]))
    const result = await requireProjectAccess('ws-1', 'user-1', 'project-1')
    expect(result).not.toBeNull()
    expect(result!.status).toBe(403)
  })

  it('非メンバー（ロールなし）は 403 を返す', async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([]))                       // role なし → null
      .mockReturnValueOnce(selectChain([]))                       // membership なし
    const result = await requireProjectAccess('ws-1', 'user-1', 'project-1')
    expect(result).not.toBeNull()
    expect(result!.status).toBe(403)
  })
})
