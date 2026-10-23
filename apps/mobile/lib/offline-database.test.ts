import { describe, expect, it, vi } from 'vitest'
import type { SQLiteDatabase } from 'expo-sqlite'
import {
  initializeOfflineDatabase,
  OFFLINE_DATABASE_NAME,
  OFFLINE_DATABASE_VERSION,
} from './offline-database'

function databaseStub(currentVersion: number) {
  return {
    execAsync: vi.fn().mockResolvedValue(undefined),
    getFirstAsync: vi.fn().mockResolvedValue({ version: currentVersion }),
    runAsync: vi.fn().mockResolvedValue(undefined),
  } as unknown as SQLiteDatabase
}

describe('オフラインSQLite基盤', () => {
  it('固定名とschema versionを管理する', () => {
    expect(OFFLINE_DATABASE_NAME).toBe('cairn-offline.db')
    expect(OFFLINE_DATABASE_VERSION).toBe(1)
  })

  it('初回起動でWALとforeign keysを有効化してmigrationを記録する', async () => {
    const database = databaseStub(0)

    await initializeOfflineDatabase(database)

    expect(database.execAsync).toHaveBeenCalledWith(expect.stringContaining('journal_mode = WAL'))
    expect(database.execAsync).toHaveBeenCalledWith(expect.stringContaining('foreign_keys = ON'))
    expect(database.runAsync).toHaveBeenCalledWith(
      'INSERT INTO offline_schema_migrations (version, applied_at) VALUES (?, ?)',
      1,
      expect.any(String),
    )
  })

  it('アプリより新しいschemaを暗黙に開かない', async () => {
    const database = databaseStub(OFFLINE_DATABASE_VERSION + 1)

    await expect(initializeOfflineDatabase(database)).rejects.toThrow(
      '端末キャッシュのバージョン 2 はアプリの対応上限 1 を超えています',
    )
    expect(database.runAsync).not.toHaveBeenCalled()
  })
})
