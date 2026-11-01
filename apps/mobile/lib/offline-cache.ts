import { mergeChatMessages } from './mobile-chat-state'

// 端末キャッシュの判定・直列化・SQL をここに集める。SQLite への接続は offline-cache-store.ts が持つ。
// キャッシュは圏外・取得失敗時の表示専用で、オンラインで取得できたときの代替値にしない。

export const MAX_CACHED_MESSAGES = 50
/** API の 1 回の取得件数と同じ */
export const MAX_CACHED_NOTIFICATIONS = 50
/** 端末を圧迫しないよう、最近同期したチャンネルだけを残す */
export const MAX_CACHED_CHANNELS = 50
/** 未選択のユーザーはサーバーが既定のワークスペースを選ぶため、その分を 1 つの枠で持つ */
export const DEFAULT_WORKSPACE_KEY = 'default'

export type ChannelListKind = 'project' | 'workspace' | 'dm'

export type OfflineCacheTarget =
  | { type: 'channel-list'; kind: ChannelListKind }
  | { type: 'notifications' }
  | { type: 'messages'; channelId: string }

export interface OfflineCacheScope {
  userId: string
  workspaceId: string | null
}

export interface CacheStatement {
  sql: string
  params: (string | number)[]
}

export interface CachedEntry<T> {
  data: T
  syncedAt: number
}

export interface CacheRow {
  payload: string
  synced_at: number
}

export interface OfflineRead<T> {
  data: T | undefined
  /** 圏外または取得失敗で、古いデータを見せている */
  stale: boolean
  /** stale のときだけ、見せているデータを同期した時刻 */
  syncedAt: number | null
  error: Error | null
  loading: boolean
}

const CACHE_TABLES = ['cached_channel_lists', 'cached_messages', 'cached_notifications'] as const

function workspaceKey(workspaceId: string | null): string {
  return workspaceId ?? DEFAULT_WORKSPACE_KEY
}

export function offlineCacheTargetKey(target: OfflineCacheTarget): string {
  if (target.type === 'channel-list') return `channel-list:${target.kind}`
  if (target.type === 'messages') return `messages:${target.channelId}`
  return 'notifications'
}

export function isSameOfflineCacheScope(
  left: OfflineCacheScope | null,
  right: OfflineCacheScope | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.userId === right.userId &&
    left.workspaceId === right.workspaceId
  )
}

function targetTableAndKeys(
  target: OfflineCacheTarget,
  scope: OfflineCacheScope,
): { table: string; columns: string[]; values: string[] } {
  if (target.type === 'channel-list') {
    return {
      table: 'cached_channel_lists',
      columns: ['user_id', 'workspace_key', 'kind'],
      values: [scope.userId, workspaceKey(scope.workspaceId), target.kind],
    }
  }
  if (target.type === 'messages') {
    return {
      table: 'cached_messages',
      columns: ['user_id', 'channel_id'],
      values: [scope.userId, target.channelId],
    }
  }
  return {
    table: 'cached_notifications',
    columns: ['user_id', 'workspace_key'],
    values: [scope.userId, workspaceKey(scope.workspaceId)],
  }
}

function whereColumns(columns: string[]): string {
  return columns.map((column) => `${column} = ?`).join(' AND ')
}

export function selectCacheStatement(
  target: OfflineCacheTarget,
  scope: OfflineCacheScope,
): CacheStatement {
  const { table, columns, values } = targetTableAndKeys(target, scope)
  return {
    sql: `SELECT payload, synced_at FROM ${table} WHERE ${whereColumns(columns)}`,
    params: values,
  }
}

export function upsertCacheStatements(
  target: OfflineCacheTarget,
  scope: OfflineCacheScope,
  payload: string,
  syncedAt: number,
): CacheStatement[] {
  const { table, columns, values } = targetTableAndKeys(target, scope)
  const upsert: CacheStatement = {
    sql: `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}, payload, synced_at) VALUES (${columns
      .map(() => '?')
      .join(', ')}, ?, ?)`,
    params: [...values, payload, syncedAt],
  }
  if (target.type !== 'messages') return [upsert]
  return [
    upsert,
    {
      sql: 'DELETE FROM cached_messages WHERE user_id = ? AND channel_id NOT IN (SELECT channel_id FROM cached_messages WHERE user_id = ? ORDER BY synced_at DESC LIMIT ?)',
      params: [scope.userId, scope.userId, MAX_CACHED_CHANNELS],
    },
  ]
}

export function deleteCacheStatement(
  target: OfflineCacheTarget,
  scope: OfflineCacheScope,
): CacheStatement {
  const { table, columns, values } = targetTableAndKeys(target, scope)
  return { sql: `DELETE FROM ${table} WHERE ${whereColumns(columns)}`, params: values }
}

export function deleteUserCacheStatements(userId: string): CacheStatement[] {
  return CACHE_TABLES.map((table) => ({
    sql: `DELETE FROM ${table} WHERE user_id = ?`,
    params: [userId],
  }))
}

export function deleteOtherUsersCacheStatements(userId: string): CacheStatement[] {
  return CACHE_TABLES.map((table) => ({
    sql: `DELETE FROM ${table} WHERE user_id <> ?`,
    params: [userId],
  }))
}

export function deleteAllCacheStatements(): CacheStatement[] {
  return CACHE_TABLES.map((table) => ({ sql: `DELETE FROM ${table}`, params: [] }))
}

export function hasUserCacheStatement(userId: string): CacheStatement {
  return {
    sql: 'SELECT 1 AS found FROM cached_channel_lists WHERE user_id = ? LIMIT 1',
    params: [userId],
  }
}

export function serializeCachePayload(target: OfflineCacheTarget, data: unknown[]): string {
  if (target.type === 'messages') {
    const messages = mergeChatMessages(data as { id: string; createdAt: string }[])
    return JSON.stringify(messages.slice(-MAX_CACHED_MESSAGES))
  }
  if (target.type === 'notifications') {
    return JSON.stringify(data.slice(0, MAX_CACHED_NOTIFICATIONS))
  }
  return JSON.stringify(data)
}

/** 読めない行は無かったものとして扱い、呼び出し元の取得エラーをそのまま見せる */
export function parseCacheRow<T>(row: CacheRow | null | undefined): CachedEntry<T[]> | null {
  if (!row || !Number.isFinite(row.synced_at)) return null
  try {
    const data: unknown = JSON.parse(row.payload)
    return Array.isArray(data) ? { data: data as T[], syncedAt: row.synced_at } : null
  } catch {
    return null
  }
}

function errorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const { status } = error as { status?: unknown }
  return typeof status === 'number' ? status : null
}

/** 届かなかった・サーバー障害のときだけ。4xx はサーバーの判定なのでキャッシュで覆さない */
export function canFallBackToCache(error: unknown): boolean {
  const status = errorStatus(error)
  return status === null || status >= 500
}

/** 外された・消えたと確定したデータは、次に圏外になっても見せないよう端末から消す */
export function isCacheRevokedError(error: unknown): boolean {
  const status = errorStatus(error)
  return status === 403 || status === 404
}

export function shouldReadOfflineCache(input: {
  online: boolean
  data: unknown
  error: unknown
}): boolean {
  if (input.data !== undefined) return false
  if (input.error) return canFallBackToCache(input.error)
  return !input.online
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/** cached は undefined が読み出し中、null がキャッシュなし */
export function resolveOfflineRead<T>(input: {
  online: boolean
  data: T | undefined
  dataUpdatedAt: number
  error: unknown
  isLoading: boolean
  /** 追加ページの失敗は読み込み済みのデータの鮮度と関係ない */
  isFetchNextPageError?: boolean
  cached: CachedEntry<T> | null | undefined
}): OfflineRead<T> {
  const { online, data, dataUpdatedAt, error, isLoading, isFetchNextPageError, cached } = input
  const blockingError = error && !canFallBackToCache(error) ? toError(error) : null
  if (data !== undefined) {
    const stale = !blockingError && (!online || (!!error && !isFetchNextPageError))
    return {
      data,
      stale,
      syncedAt: stale ? dataUpdatedAt : null,
      error: blockingError,
      loading: false,
    }
  }
  if (blockingError) {
    return { data: undefined, stale: false, syncedAt: null, error: blockingError, loading: false }
  }
  if (cached) {
    return { data: cached.data, stale: true, syncedAt: cached.syncedAt, error: null, loading: false }
  }
  return {
    data: undefined,
    stale: false,
    syncedAt: null,
    error: error && cached === null ? toError(error) : null,
    loading: isLoading || cached === undefined,
  }
}

/** 複数の一覧を並べる画面では、いちばん古い同期時刻を出す */
export function oldestSyncedAt(
  reads: ReadonlyArray<Pick<OfflineRead<unknown>, 'syncedAt'>>,
): number | null {
  const times = reads.flatMap((read) => (read.syncedAt === null ? [] : [read.syncedAt]))
  return times.length > 0 ? Math.min(...times) : null
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 前日以前の同期を今日の時刻に見せないよう、日が違えば日付も出す */
export function formatLastSynced(syncedAt: number, now: Date = new Date()): string {
  const synced = new Date(syncedAt)
  const time = `${pad(synced.getHours())}:${pad(synced.getMinutes())}`
  const sameDay =
    synced.getFullYear() === now.getFullYear() &&
    synced.getMonth() === now.getMonth() &&
    synced.getDate() === now.getDate()
  return sameDay ? time : `${synced.getMonth() + 1}/${synced.getDate()} ${time}`
}

export function isNetworkRecovery(wasOnline: boolean, online: boolean): boolean {
  return !wasOnline && online
}
