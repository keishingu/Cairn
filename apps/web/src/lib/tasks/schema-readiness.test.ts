// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { hasTaskChannelSchema, insertLegacyTasks } from './schema-readiness'

describe('hasTaskChannelSchema', () => {
  it.each([
    [true, true],
    [false, false],
  ])('migrationの適用状態 %s を返す', async (ready, expected) => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ ready }] })
    await expect(hasTaskChannelSchema({ execute } as never)).resolves.toBe(expected)
  })
})

describe('insertLegacyTasks', () => {
  it('migration前のINSERTにchannel_idを含めない', async () => {
    const execute = vi.fn(async (query) => {
      const built = new PgDialect().sqlToQuery(query)
      expect(built.sql).not.toContain('channel_id')
      return {
        rows: [
          {
            id: 'task-id',
            projectId: null,
            title: 'task',
            status: 'todo',
            priority: 'medium',
            dueDate: null,
            assigneeId: null,
          },
        ],
      }
    })

    const result = await insertLegacyTasks({ execute } as never, [
      {
        workspaceId: 'workspace-id',
        projectId: null,
        title: 'task',
        createdBy: 'user-id',
      },
    ])

    expect(result).toHaveLength(1)
  })
})
