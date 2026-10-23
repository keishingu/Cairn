// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'
import { hasAttachmentUploadRequestSchema } from './schema-readiness'

vi.mock('drizzle-orm', () => ({ sql: vi.fn(() => 'schema-query') }))

describe('hasAttachmentUploadRequestSchema', () => {
  it('必要なmigrationが適用済みならtrueを返す', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ ready: true }] })
    await expect(hasAttachmentUploadRequestSchema({ execute } as never)).resolves.toBe(true)
  })

  it('Vercelがmigrationより先に切り替わった場合はfalseを返す', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ ready: false }] })
    await expect(hasAttachmentUploadRequestSchema({ execute } as never)).resolves.toBe(false)
  })
})
