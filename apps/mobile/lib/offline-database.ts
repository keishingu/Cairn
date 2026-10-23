import type { SQLiteDatabase } from 'expo-sqlite'

export const OFFLINE_DATABASE_NAME = 'cairn-offline.db'
export const OFFLINE_DATABASE_VERSION = 1

export async function initializeOfflineDatabase(database: SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS offline_schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  const current = await database.getFirstAsync<{ version: number }>(
    'SELECT COALESCE(MAX(version), 0) AS version FROM offline_schema_migrations',
  )
  const currentVersion = current?.version ?? 0

  if (currentVersion > OFFLINE_DATABASE_VERSION) {
    throw new Error(
      `端末キャッシュのバージョン ${currentVersion} はアプリの対応上限 ${OFFLINE_DATABASE_VERSION} を超えています`,
    )
  }

  if (currentVersion < 1) {
    await database.runAsync(
      'INSERT INTO offline_schema_migrations (version, applied_at) VALUES (?, ?)',
      1,
      new Date().toISOString(),
    )
  }
}
