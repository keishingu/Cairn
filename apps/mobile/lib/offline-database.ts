import type { SQLiteDatabase } from 'expo-sqlite'

export const OFFLINE_DATABASE_NAME = 'cairn-offline.db'
export const OFFLINE_DATABASE_VERSION = 2

const CREATE_CACHE_TABLES = `
  CREATE TABLE IF NOT EXISTS cached_channel_lists (
    user_id TEXT NOT NULL,
    workspace_key TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    synced_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, workspace_key, kind)
  );
  CREATE TABLE IF NOT EXISTS cached_messages (
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    synced_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, channel_id)
  );
  CREATE TABLE IF NOT EXISTS cached_notifications (
    user_id TEXT NOT NULL,
    workspace_key TEXT NOT NULL,
    payload TEXT NOT NULL,
    synced_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, workspace_key)
  );
`

const DROP_CACHE_TABLES = `
  DROP TABLE IF EXISTS cached_channel_lists;
  DROP TABLE IF EXISTS cached_messages;
  DROP TABLE IF EXISTS cached_notifications;
`

/**
 * schema の版は `PRAGMA user_version` で持つ。`offline_schema_migrations` は 1 のまま増やさない。
 * ストア版の内蔵バンドルと既存の OTA は、この表の最大値が 1 を超えると例外を投げ、
 * SQLiteProvider が描画中に再送出して起動できなくなるため、OTA を戻しても起動できるようにする。
 * 中身はサーバーから取り直せるキャッシュだけなので、アプリより新しい版は捨てて作り直す。
 */
export async function initializeOfflineDatabase(database: SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `)

  const current = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  const currentVersion = current?.user_version ?? 0
  if (currentVersion === OFFLINE_DATABASE_VERSION) return

  await database.execAsync(`
    ${currentVersion > OFFLINE_DATABASE_VERSION ? DROP_CACHE_TABLES : ''}
    ${CREATE_CACHE_TABLES}
    PRAGMA user_version = ${OFFLINE_DATABASE_VERSION};
  `)
}
