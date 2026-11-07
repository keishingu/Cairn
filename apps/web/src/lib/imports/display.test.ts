// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest'

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }))

function failingChain(error: unknown) {
  const chain: Record<string, unknown> = {}
  for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy']) chain[method] = () => chain
  chain['then'] = (_resolve: unknown, reject: (reason: unknown) => unknown) => Promise.reject(error).catch(reject)
  return chain
}

vi.mock('@cairn/db', () => ({
  db: { select: mockSelect },
  importedMessages: {}, importIdentities: {}, importedMessageReactions: {}, workspaceMembers: {}, profiles: {},
}))
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), inArray: vi.fn(), asc: vi.fn() }))

import { loadImportedReactions, loadImportedSenders } from './display'

describe('取り込みのテーブルが無いとき（マイグレーション前のデプロイ）', () => {
  test('投稿者・リアクションは空として扱い、通常のメッセージの表示を妨げない', async () => {
    mockSelect.mockImplementation(() => failingChain(Object.assign(new Error('relation does not exist'), { code: '42P01' })))
    await expect(loadImportedSenders('ws', ['m1'])).resolves.toEqual(new Map())
    await expect(loadImportedReactions('ws', ['m1'])).resolves.toEqual([])
  })

  test('それ以外のエラーは隠さずに投げる', async () => {
    mockSelect.mockImplementation(() => failingChain(Object.assign(new Error('timeout'), { code: '57014' })))
    await expect(loadImportedSenders('ws', ['m1'])).rejects.toThrow('timeout')
  })
})
