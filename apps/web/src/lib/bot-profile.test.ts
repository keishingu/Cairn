// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockDbSelect,
  mockDbInsert,
  mockDbTransaction,
  mockDbExecute,
  mockEq,
  mockAnd,
  mockSql,
  mockRandomUUID,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockDbExecute: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockSql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
    {
      join: (parts: unknown[], separator: unknown) => ({ parts, separator }),
    },
  ),
  mockRandomUUID: vi.fn(() => 'bot-profile-id'),
}))

vi.mock('@cairn/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    execute: mockDbExecute,
    transaction: mockDbTransaction,
  },
  profiles: {
    id: 'profiles.id',
    kind: 'profiles.kind',
    displayName: 'profiles.displayName',
  },
  workspaceMembers: {
    workspaceId: 'workspaceMembers.workspaceId',
    userId: 'workspaceMembers.userId',
    role: 'workspaceMembers.role',
    membershipStatus: 'workspaceMembers.membershipStatus',
    status: 'workspaceMembers.status',
  },
  workspaces: {
    id: 'workspaces.id',
    name: 'workspaces.name',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  and: mockAnd,
  sql: mockSql,
}))

vi.mock('crypto', () => ({
  randomUUID: mockRandomUUID,
}))

function selectChain(result: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    innerJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn().mockResolvedValue(result),
  }
  return builder
}

function insertChain() {
  return { values: vi.fn().mockResolvedValue(undefined) }
}

describe('ensureWorkspaceBotProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbTransaction.mockImplementation(async (cb: (tx: {
      select: typeof mockDbSelect
      insert: typeof mockDbInsert
      execute: typeof mockDbExecute
    }) => unknown) => cb({
      select: mockDbSelect,
      insert: mockDbInsert,
      execute: mockDbExecute,
    }))
  })

  it('既存の bot profile があれば再利用する', async () => {
    mockDbSelect.mockReturnValueOnce(
      selectChain([{ id: 'bot-existing', displayName: 'Alpha Bot' }]),
    )

    const { ensureWorkspaceBotProfile } = await import('./bot-profile')
    await expect(ensureWorkspaceBotProfile('ws-1')).resolves.toEqual({
      id: 'bot-existing',
      displayName: 'Alpha Bot',
    })

    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('bot profile が無ければ workspace 名から作成する', async () => {
    mockDbSelect
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ name: 'Alpine Club' }]))
    const insertProfile = insertChain()
    const insertMembership = insertChain()
    mockDbInsert
      .mockReturnValueOnce(insertProfile)
      .mockReturnValueOnce(insertMembership)

    const { ensureWorkspaceBotProfile } = await import('./bot-profile')
    await expect(ensureWorkspaceBotProfile('ws-1')).resolves.toEqual({
      id: 'bot-profile-id',
      displayName: 'Alpine Club Bot',
    })

    expect(mockDbExecute).toHaveBeenCalledTimes(1)
    expect(mockDbInsert).toHaveBeenCalledTimes(2)
    expect(insertMembership.values).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      userId: 'bot-profile-id',
      role: 'member',
      membershipStatus: 'inactive',
      status: 'offline',
    })
  })

  it('ロック取得後に既存 bot が見つかったら再利用する', async () => {
    mockDbSelect
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ id: 'bot-after-lock', displayName: 'Locked Bot' }]))

    const { ensureWorkspaceBotProfile } = await import('./bot-profile')
    await expect(ensureWorkspaceBotProfile('ws-1')).resolves.toEqual({
      id: 'bot-after-lock',
      displayName: 'Locked Bot',
    })

    expect(mockDbExecute).toHaveBeenCalledTimes(1)
    expect(mockDbInsert).not.toHaveBeenCalled()
  })
})
