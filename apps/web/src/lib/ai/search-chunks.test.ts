// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_FLAGS } from '@cairn/shared'

const { mockExecute, mockSql } = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue([])
  const mockSql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce(
      (query, part, index) => query + part + (index < values.length ? String(values[index]) : ''),
      '',
    ),
    { join: vi.fn() },
  )
  return { mockExecute, mockSql }
})

vi.mock('ai', () => ({
  embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2] }),
}))

vi.mock('./client', () => ({
  openai: { embedding: vi.fn(() => 'embedding-model') },
  EMBEDDING_MODEL: 'test-model',
}))

vi.mock('@cairn/db', () => ({
  db: { execute: mockExecute },
}))

vi.mock('drizzle-orm', () => ({ sql: mockSql }))

import { searchChunks } from './search-chunks'

const originalDmFlag = FEATURE_FLAGS.dm

describe('searchChunks', () => {
  afterEach(() => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = originalDmFlag
    vi.clearAllMocks()
    mockExecute.mockResolvedValue([])
  })

  it('DMが無効なとき、DM専用ファイルのチャンクを検索条件から除外する', async () => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = false

    await searchChunks('検索語', '11111111-1111-1111-1111-111111111111')

    const query = String(mockExecute.mock.calls[0]?.[0])
    expect(query).toContain("dm_channel.type = 'dm'")
    expect(query).toContain("non_dm_channel.type <> 'dm'")
    expect(query).toContain('non_dm_file.project_id IS NOT NULL')
  })

  it('DMが有効なとき、DMファイルの追加条件を適用しない', async () => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = true

    await searchChunks('検索語', '11111111-1111-1111-1111-111111111111')

    const query = String(mockExecute.mock.calls[0]?.[0])
    expect(query).not.toContain("dm_channel.type = 'dm'")
  })
})
