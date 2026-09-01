// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db } = vi.hoisted(() => ({ db: { select: vi.fn() } }))

vi.mock('@cairn/db', () => ({
  db,
  workspaceMembers: {
    id: 'member.id',
    userId: 'member.userId',
    workspaceId: 'member.workspaceId',
    profileAttributes: 'member.profileAttributes',
  },
  workspaceMemberProfileAttributes: {
    workspaceMemberId: 'assignment.workspaceMemberId',
    profileAttributeId: 'assignment.profileAttributeId',
  },
  workspaceProfileAttributes: {
    id: 'attribute.id',
    name: 'attribute.name',
    color: 'attribute.color',
    createdAt: 'attribute.createdAt',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  asc: vi.fn(() => 'asc'),
  eq: vi.fn(() => 'eq'),
  inArray: vi.fn(() => 'inArray'),
}))

function databaseError(code: string) {
  return Object.assign(new Error(code), { code })
}

function relationalQuery(result: unknown[] | Error) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: result instanceof Error
      ? vi.fn().mockRejectedValue(result)
      : vi.fn().mockResolvedValue(result),
  }
  chain.from.mockReturnValue(chain)
  chain.innerJoin.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  return chain
}

function legacyQuery(result: unknown[] | Error) {
  return {
    from: vi.fn().mockReturnValue({
      where: result instanceof Error
        ? vi.fn().mockRejectedValue(result)
        : vi.fn().mockResolvedValue(result),
    }),
  }
}

describe('getProfileAttributesByUserIds', () => {
  beforeEach(() => db.select.mockReset())

  it('属性テーブル未作成時は旧JSON列を返す', async () => {
    db.select
      .mockReturnValueOnce(relationalQuery(databaseError('42P01')))
      .mockReturnValueOnce(legacyQuery([
        { userId: 'user-1', profileAttributes: ['3年生', '経済学部'] },
      ]))

    const { getProfileAttributesByUserIds } = await import('./profile-attributes')
    const result = await getProfileAttributesByUserIds('workspace-1', ['user-1'])

    expect(result.get('user-1')).toEqual([
      { id: 'legacy:0', name: '3年生', color: 'slate' },
      { id: 'legacy:1', name: '経済学部', color: 'slate' },
    ])
  })

  it('旧JSON列も未作成なら旧仕様どおり属性なしで返す', async () => {
    db.select
      .mockReturnValueOnce(relationalQuery(databaseError('42P01')))
      .mockReturnValueOnce(legacyQuery(databaseError('42703')))

    const { getProfileAttributesByUserIds } = await import('./profile-attributes')
    const result = await getProfileAttributesByUserIds('workspace-1', ['user-1'])

    expect(result.size).toBe(0)
  })

  it('schema適用順と無関係なDBエラーは隠さない', async () => {
    const error = databaseError('08006')
    db.select.mockReturnValueOnce(relationalQuery(error))

    const { getProfileAttributesByUserIds } = await import('./profile-attributes')
    await expect(getProfileAttributesByUserIds('workspace-1', ['user-1'])).rejects.toBe(error)
  })
})
