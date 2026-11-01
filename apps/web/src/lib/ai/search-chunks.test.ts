// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_FLAGS } from '@cairn/shared'

const { mockExecute, mockSql } = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue({ rows: [] })
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
    mockExecute.mockResolvedValue({ rows: [] })
  })

  it('DMが無効なとき、DM専用ファイルのチャンクを検索条件から除外する', async () => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = false

    await searchChunks('検索語', '11111111-1111-1111-1111-111111111111', {
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'member',
    })

    const query = String(mockExecute.mock.calls[0]?.[0])
    expect(query).toContain("dm_channel.type = 'dm'")
    expect(query).toContain("non_dm_channel.type <> 'dm'")
    expect(query).toContain('non_dm_file.project_id IS NOT NULL')
  })

  it('DMが有効なとき、DMファイルの追加条件を適用しない', async () => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = true

    await searchChunks('検索語', '11111111-1111-1111-1111-111111111111', {
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'member',
    })

    const query = String(mockExecute.mock.calls[0]?.[0])
    expect(query).not.toContain("dm_channel.type = 'dm'")
  })

  it('memberのファイルチャンクは公開チャンネルまたは現在参加中のチャンネルに限定する', async () => {
    await searchChunks('検索語', '11111111-1111-1111-1111-111111111111', {
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'member',
    })

    const query = String(mockExecute.mock.calls[0]?.[0])
    expect(query).toContain("source_channel.type <> 'dm' AND source_channel.is_private = false")
    expect(query).toContain('FROM channel_members source_cm')
    expect(query).toContain('source_file.uploaded_by')
  })

  it('guestのファイルチャンクは参加プロジェクトと参加チャンネルに限定する', async () => {
    await searchChunks('検索語', '11111111-1111-1111-1111-111111111111', {
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'guest',
      allowedProjectIds: ['33333333-3333-3333-3333-333333333333'],
    })

    const query = String(mockExecute.mock.calls[0]?.[0])
    expect(query).toContain('FROM project_members source_pm')
    expect(query).toContain('FROM channel_members source_cm')
  })

  it('参加プロジェクトがないguestも参加チャンネルで見えるファイルを検索できる', async () => {
    await searchChunks('検索語', '11111111-1111-1111-1111-111111111111', {
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'guest',
      allowedProjectIds: [],
    })

    expect(mockExecute).toHaveBeenCalledTimes(1)
    const query = String(mockExecute.mock.calls[0]?.[0])
    expect(query).toContain('AND source_type = \'file\'')
    expect(query).toContain('FROM channel_members source_cm')
  })

  it('node-postgresのrowsから検索結果を返す', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          source_type: 'file',
          source_id: '33333333-3333-3333-3333-333333333333',
          content: '検索結果',
          similarity: '0.75',
        },
      ],
    })

    const result = await searchChunks('検索語', '11111111-1111-1111-1111-111111111111', {
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'member',
    })

    expect(result).toEqual([
      {
        sourceType: 'file',
        sourceId: '33333333-3333-3333-3333-333333333333',
        content: '検索結果',
        similarity: 0.75,
      },
    ])
  })

  it('新しさの半減期を指定したときは候補を広げて取り、新しい資料を上にして件数どおり返す', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { source_type: 'project', source_id: 'p-old', content: '古い計画', similarity: '0.8', source_date: '2024-11-01T00:00:00Z' },
        { source_type: 'file', source_id: 'f-new', content: '新しい資料', similarity: '0.7', source_date: '2026-10-25T00:00:00Z' },
        { source_type: 'member', source_id: 'm-1', content: 'メンバー', similarity: '0.6', source_date: null },
      ],
    })

    const result = await searchChunks('検索語', '11111111-1111-1111-1111-111111111111', {
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'member',
      limit: 2,
      recencyHalfLifeDays: 365,
      now: new Date('2026-11-01T00:00:00Z'),
    })

    const query = String(mockExecute.mock.calls[0]?.[0])
    expect(query).toContain('LIMIT 8')
    expect(result.map((match) => match.sourceId)).toEqual(['f-new', 'm-1'])
    expect(result[0]).toMatchObject({ similarity: 0.7 })
    expect(result[0]).not.toHaveProperty('sourceDate')
  })

  it('新しさを指定しないときは従来どおりの件数で取り、点数を付けない', async () => {
    await searchChunks('検索語', '11111111-1111-1111-1111-111111111111', {
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'member',
      limit: 2,
    })

    expect(String(mockExecute.mock.calls[0]?.[0])).toContain('LIMIT 2')
  })
})
