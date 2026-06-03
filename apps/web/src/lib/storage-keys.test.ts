import { describe, test, expect } from 'vitest'
import { STORAGE_KEYS } from './storage-keys'

describe('STORAGE_KEYS', () => {
  const keys = Object.values(STORAGE_KEYS)

  test('すべてのキーが cairn: プレフィックスで始まる', () => {
    for (const key of keys) {
      expect(key, `"${key}" は cairn: で始まる必要があります`).toMatch(/^cairn:/)
    }
  })

  test('すべてのキーが cairn:<snake_case> 形式に準拠している', () => {
    for (const key of keys) {
      expect(key, `"${key}" は cairn:<snake_case> 形式である必要があります`).toMatch(/^cairn:[a-z][a-z0-9_]*$/)
    }
  })

  test('重複するキー値がない', () => {
    expect(keys.length).toBe(new Set(keys).size)
  })
})
