// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockDbSelect } = vi.hoisted(() => ({ mockDbSelect: vi.fn() }))

vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect },
  channels: { id: 'channels.id', type: 'channels.type', parentChannelId: 'channels.parentChannelId' },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }))

function selectResults(...results: unknown[][]) {
  const queue = [...results]
  mockDbSelect.mockImplementation(() => {
    const result = queue.shift() ?? []
    const builder = {
      from: () => builder,
      where: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
    return builder
  })
}

describe('チャンネルの家族（親とスレッド）の解決', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('スレッドからは親チャンネルと兄弟スレッドを含めて返す', async () => {
    selectResults([{ type: 'workspace', parentChannelId: 'parent' }], [{ id: 'thread-1' }, { id: 'thread-2' }])
    const { loadChannelFamilyIds } = await import('./channel-family')

    await expect(loadChannelFamilyIds('thread-1')).resolves.toEqual(['parent', 'thread-1', 'thread-2'])
  })

  it('親チャンネルからは自身と配下のスレッドを返す', async () => {
    selectResults([{ type: 'workspace', parentChannelId: null }], [{ id: 'thread-1' }])
    const { loadChannelFamilyIds } = await import('./channel-family')

    await expect(loadChannelFamilyIds('parent')).resolves.toEqual(['parent', 'thread-1'])
  })

  it('プロジェクトチャンネルやDMは自分自身だけを返す', async () => {
    selectResults([{ type: 'project', parentChannelId: null }])
    const { loadChannelFamilyIds } = await import('./channel-family')

    await expect(loadChannelFamilyIds('project-channel')).resolves.toEqual(['project-channel'])
    expect(mockDbSelect).toHaveBeenCalledTimes(1)
  })
})
