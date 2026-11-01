import type { SQLiteDatabase } from 'expo-sqlite'
import {
  deleteAllCacheStatements,
  deleteCacheStatement,
  deleteOtherUsersCacheStatements,
  deleteUserCacheStatements,
  hasUserCacheStatement,
  isCacheRevokedError,
  isSameOfflineCacheScope,
  parseCacheRow,
  selectCacheStatement,
  serializeCachePayload,
  upsertCacheStatements,
  type CachedEntry,
  type CacheRow,
  type CacheStatement,
  type OfflineCacheScope,
  type OfflineCacheTarget,
} from './offline-cache'
import { initializeOfflineDatabase, OFFLINE_DATABASE_NAME } from './offline-database'
import { getSelectedWorkspaceId } from './workspace-selection'

// QueryClient と同じくモジュールで 1 つ持つ。開けない・壊れていても起動とオンライン表示は止めず、
// キャッシュなしとして動く（圏外ならキャッシュなしのエラーが出る）。
let databaseReady: Promise<SQLiteDatabase | null> | null = null
let activeUserId: string | null = null
let queue: Promise<void> = Promise.resolve()

export function startOfflineCache(open: (name: string) => Promise<SQLiteDatabase>): void {
  if (databaseReady) return
  databaseReady = open(OFFLINE_DATABASE_NAME)
    .then(async (database) => {
      await initializeOfflineDatabase(database)
      return database
    })
    .catch((error: unknown) => {
      console.warn('[offline-cache] 端末キャッシュを開けませんでした:', error)
      return null
    })
}

// 書き込みと削除を順に実行し、サインアウトの削除より後に古い書き込みが残らないようにする
function enqueue(task: (database: SQLiteDatabase) => Promise<void>): void {
  queue = queue.then(async () => {
    const database = await databaseReady
    if (!database) return
    try {
      await task(database)
    } catch (error) {
      console.warn('[offline-cache] 端末キャッシュを更新できませんでした:', error)
    }
  })
}

async function runStatements(database: SQLiteDatabase, statements: CacheStatement[]): Promise<void> {
  for (const { sql, params } of statements) await database.runAsync(sql, params)
}

/** サインイン中のユーザーを渡す。別ユーザーの行が残っていれば消す（削除前に終了した場合など） */
export function setOfflineCacheUser(userId: string | null): void {
  activeUserId = userId
  if (userId) enqueue((database) => runStatements(database, deleteOtherUsersCacheStatements(userId)))
}

export function deleteOfflineCacheForUser(userId: string): void {
  enqueue((database) => runStatements(database, deleteUserCacheStatements(userId)))
}

/** サインアウトが確定したとき。起動時はどのユーザーの行が残っているか分からないので全行を消す */
export function deleteAllOfflineCache(): void {
  enqueue((database) => runStatements(database, deleteAllCacheStatements()))
}

async function currentScope(): Promise<OfflineCacheScope | null> {
  const userId = activeUserId
  if (!userId) return null
  try {
    return { userId, workspaceId: await getSelectedWorkspaceId(userId) }
  } catch (error) {
    console.warn('[offline-cache] 選択中のワークスペースを読み込めませんでした:', error)
    return null
  }
}

/**
 * 取得に成功したときだけ端末へ書く（書き込みの失敗は取得結果に影響させない）。
 * 取得中にユーザーやワークスペースが変わった結果は、別の枠へ入らないよう捨てる。
 */
export async function fetchWithOfflineCache<T>(
  target: OfflineCacheTarget,
  fetcher: () => Promise<T>,
  toItems: (data: T) => unknown[],
): Promise<T> {
  const scope = await currentScope()
  try {
    const data = await fetcher()
    if (isSameOfflineCacheScope(scope, await currentScope())) {
      const syncedAt = Date.now()
      enqueue(async (database) => {
        if (!scope || activeUserId !== scope.userId) return
        const payload = serializeCachePayload(target, toItems(data))
        await runStatements(database, upsertCacheStatements(target, scope, payload, syncedAt))
      })
    }
    return data
  } catch (error) {
    if (scope && isCacheRevokedError(error)) {
      enqueue((database) => runStatements(database, [deleteCacheStatement(target, scope)]))
    }
    throw error
  }
}

export async function readOfflineCache<T>(
  target: OfflineCacheTarget,
  scope: OfflineCacheScope,
): Promise<CachedEntry<T[]> | null> {
  const database = await databaseReady
  if (!database) return null
  const { sql, params } = selectCacheStatement(target, scope)
  return parseCacheRow<T>(await database.getFirstAsync<CacheRow>(sql, params))
}

/** 起動時に通信できなくても一覧へ進めるかの判定に使う。読めないときはキャッシュなしとして扱う */
export async function hasOfflineCache(userId: string): Promise<boolean> {
  const database = await databaseReady
  if (!database) return false
  try {
    const { sql, params } = hasUserCacheStatement(userId)
    return (await database.getFirstAsync(sql, params)) !== null
  } catch (error) {
    console.warn('[offline-cache] 端末キャッシュを読み込めませんでした:', error)
    return false
  }
}
