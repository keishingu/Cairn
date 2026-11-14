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
    getFirstAsync: vi.fn().mockResolvedValue({ user_version: currentVersion }),
    runAsync: vi.fn().mockResolvedValue(undefined),
  } as unknown as SQLiteDatabase
}

function executedSql(database: SQLiteDatabase): string {
  return vi
    .mocked(database.execAsync)
    .mock.calls.map(([sql]) => sql)
    .join('\n')
}

describe('オフラインSQLite基盤', () => {
  it('固定名とschema versionを管理する', () => {
    expect(OFFLINE_DATABASE_NAME).toBe('cairn-offline.db')
    expect(OFFLINE_DATABASE_VERSION).toBe(2)
  })

  it('初回起動でWALとforeign keysを有効化してキャッシュの表を作る', async () => {
    const database = databaseStub(0)

    await initializeOfflineDatabase(database)

    const sql = executedSql(database)
    expect(sql).toContain('journal_mode = WAL')
    expect(sql).toContain('foreign_keys = ON')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS cached_channel_lists')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS cached_messages')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS cached_notifications')
    expect(sql).toContain('PRAGMA user_version = 2')
    expect(sql).not.toContain('DROP TABLE')
  })

  it('同じ版なら表を触らない', async () => {
    const database = databaseStub(OFFLINE_DATABASE_VERSION)

    await initializeOfflineDatabase(database)

    expect(executedSql(database)).not.toContain('cached_messages')
  })

  it('アプリより新しい版は例外にせず、キャッシュを捨てて作り直す', async () => {
    const database = databaseStub(OFFLINE_DATABASE_VERSION + 1)

    await expect(initializeOfflineDatabase(database)).resolves.toBeUndefined()

    const sql = executedSql(database)
    expect(sql.indexOf('DROP TABLE IF EXISTS cached_messages')).toBeGreaterThan(-1)
    expect(sql.indexOf('DROP TABLE IF EXISTS cached_messages')).toBeLessThan(
      sql.indexOf('CREATE TABLE IF NOT EXISTS cached_messages'),
    )
    expect(sql).toContain('PRAGMA user_version = 2')
  })

  it('古いバンドルが起動できなくなる offline_schema_migrations の版を書かない', async () => {
    const database = databaseStub(0)

    await initializeOfflineDatabase(database)

    expect(executedSql(database)).not.toContain('offline_schema_migrations')
    expect(database.runAsync).not.toHaveBeenCalled()
  })
})
