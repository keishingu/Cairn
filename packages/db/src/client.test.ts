// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, describe, expect, it, vi } from 'vitest'

const { mockDrizzle, mockPoolConstructor, mockPoolOn } = vi.hoisted(() => ({
  mockDrizzle: vi.fn(() => ({})),
  mockPoolConstructor: vi.fn(),
  mockPoolOn: vi.fn(),
}))

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: mockDrizzle,
}))

vi.mock('pg', () => ({
  Pool: class MockPool {
    constructor(options: unknown) {
      mockPoolConstructor(options)
    }

    on = mockPoolOn
  },
}))

vi.mock('./schema/index', () => ({}))

describe('DBクライアント', () => {
  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://example.test/database')
    await import('./client')
  })

  it('アイドル接続のエラーを処理してログへ記録する', () => {
    const errorHandler = mockPoolOn.mock.calls.find(([event]) => event === 'error')?.[1]
    const error = new Error('connection terminated')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(errorHandler).toBeTypeOf('function')
    errorHandler(error)

    expect(consoleError).toHaveBeenCalledWith('Unexpected error on idle PostgreSQL client', error)
    consoleError.mockRestore()
  })
})
