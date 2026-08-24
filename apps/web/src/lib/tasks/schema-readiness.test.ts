// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'
import { hasTaskChannelSchema } from './schema-readiness'

vi.mock('drizzle-orm', () => ({ sql: vi.fn(() => 'schema-query') }))

describe('hasTaskChannelSchema', () => {
  it.each([
    [true, true],
    [false, false],
  ])('migrationの適用状態 %s を返す', async (ready, expected) => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ ready }] })
    await expect(hasTaskChannelSchema({ execute } as never)).resolves.toBe(expected)
  })
})
