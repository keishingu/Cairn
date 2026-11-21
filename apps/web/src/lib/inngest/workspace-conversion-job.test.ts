// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest'

const { limit } = vi.hoisted(() => ({ limit: vi.fn() }))

vi.mock('@cairn/db', () => {
  const chain = { from: () => chain, where: () => chain, orderBy: () => chain, limit }
  return {
    db: { select: () => chain },
    workspaces: { id: 'id', createdBy: 'createdBy', createdAt: 'createdAt' },
  }
})

import { isFirstWorkspaceOf } from './workspace-conversion-job'

describe('isFirstWorkspaceOf', () => {
  test('本人が作った中で最も古いワークスペースなら true', async () => {
    limit.mockResolvedValueOnce([{ id: 'ws-1' }])
    await expect(isFirstWorkspaceOf('user-1', 'ws-1')).resolves.toBe(true)
  })

  test('後から作ったワークスペースは、処理の順番にかかわらず false', async () => {
    limit.mockResolvedValueOnce([{ id: 'ws-1' }])
    await expect(isFirstWorkspaceOf('user-1', 'ws-2')).resolves.toBe(false)
  })

  test('作成したワークスペースが見つからなければ例外にする', async () => {
    limit.mockResolvedValueOnce([])
    await expect(isFirstWorkspaceOf('user-1', 'ws-1')).rejects.toThrow('not found')
  })
})
