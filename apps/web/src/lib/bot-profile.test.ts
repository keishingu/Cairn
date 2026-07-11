// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockDbSelect,
  mockDbInsert,
  mockEq,
  mockAnd,
  mockRandomUUID,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockRandomUUID: vi.fn(() => 'bot-profile-id'),
}))

vi.mock('@cairn/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
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
  },
  workspaces: {
    id: 'workspaces.id',
    name: 'workspaces.name',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  and: mockAnd,
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
      .mockReturnValueOnce(selectChain([{ name: 'Alpine Club' }]))
    mockDbInsert
      .mockReturnValueOnce(insertChain())
      .mockReturnValueOnce(insertChain())

    const { ensureWorkspaceBotProfile } = await import('./bot-profile')
    await expect(ensureWorkspaceBotProfile('ws-1')).resolves.toEqual({
      id: 'bot-profile-id',
      displayName: 'Alpine Club Bot',
    })

    expect(mockDbInsert).toHaveBeenCalledTimes(2)
  })
})
