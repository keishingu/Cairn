import { describe, expect, it } from 'vitest'
import {
  canFallBackToCache,
  deleteCacheStatement,
  deleteAllCacheStatements,
  deleteOtherUsersCacheStatements,
  deleteUserCacheStatements,
  formatLastSynced,
  isCacheRevokedError,
  isNetworkRecovery,
  isSameOfflineCacheScope,
  MAX_CACHED_CHANNELS,
  MAX_CACHED_MESSAGES,
  MAX_CACHED_NOTIFICATIONS,
  offlineCacheTargetKey,
  oldestSyncedAt,
  parseCacheRow,
  resolveOfflineRead,
  selectCacheStatement,
  serializeCachePayload,
  shouldReadOfflineCache,
  upsertCacheStatements,
} from './offline-cache'

const scope = { userId: 'user-1', workspaceId: 'ws-1' }
const networkError = new TypeError('Network request failed')
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status })

describe('キャッシュの読み出し条件', () => {
  it('オンラインで取得中ならキャッシュを読まない', () => {
    expect(shouldReadOfflineCache({ online: true, data: undefined, error: null })).toBe(false)
  })

  it('取得済みのデータがあれば圏外でもキャッシュを読まない', () => {
    expect(shouldReadOfflineCache({ online: false, data: [], error: networkError })).toBe(false)
  })

  it('明示的に圏外なら取得の失敗を待たずに読む', () => {
    expect(shouldReadOfflineCache({ online: false, data: undefined, error: null })).toBe(true)
  })

  it('オンラインでも通信失敗とサーバー障害では読む', () => {
    expect(shouldReadOfflineCache({ online: true, data: undefined, error: networkError })).toBe(true)
    expect(shouldReadOfflineCache({ online: true, data: undefined, error: httpError(503) })).toBe(true)
  })

  it('401・403・404 はサーバーの判定なので圏外でも読まない', () => {
    for (const status of [401, 403, 404]) {
      expect(shouldReadOfflineCache({ online: false, data: undefined, error: httpError(status) })).toBe(
        false,
      )
      expect(canFallBackToCache(httpError(status))).toBe(false)
    }
  })

  it('外された・消えたと確定した 403・404 だけ端末の行を消す', () => {
    expect(isCacheRevokedError(httpError(403))).toBe(true)
    expect(isCacheRevokedError(httpError(404))).toBe(true)
    expect(isCacheRevokedError(httpError(401))).toBe(false)
    expect(isCacheRevokedError(httpError(500))).toBe(false)
    expect(isCacheRevokedError(networkError)).toBe(false)
  })
})

describe('表示するデータの決定', () => {
  const base = { online: true, dataUpdatedAt: 0, error: null, isLoading: false, cached: null }

  it('オンラインで取得できたときはキャッシュがあっても見せない', () => {
    const read = resolveOfflineRead({
      ...base,
      data: ['最新'],
      dataUpdatedAt: 100,
      cached: { data: ['古い'], syncedAt: 50 },
    })
    expect(read).toEqual({ data: ['最新'], stale: false, syncedAt: null, error: null, loading: false })
  })

  it('取得に失敗してキャッシュがあれば、同期時刻付きで見せる', () => {
    const read = resolveOfflineRead({
      ...base,
      data: undefined,
      error: networkError,
      cached: { data: ['古い'], syncedAt: 50 },
    })
    expect(read).toEqual({ data: ['古い'], stale: true, syncedAt: 50, error: null, loading: false })
  })

  it('再取得に失敗したら、取得済みのデータを古いものとして見せる', () => {
    const read = resolveOfflineRead({ ...base, data: ['既存'], dataUpdatedAt: 100, error: networkError })
    expect(read).toEqual({ data: ['既存'], stale: true, syncedAt: 100, error: null, loading: false })
  })

  it('追加ページの失敗では、オンラインならオフライン扱いにしない', () => {
    const read = resolveOfflineRead({
      ...base,
      data: ['既存'],
      dataUpdatedAt: 100,
      error: networkError,
      isFetchNextPageError: true,
    })
    expect(read).toEqual({ data: ['既存'], stale: false, syncedAt: null, error: null, loading: false })
  })

  it('追加ページの失敗でも、圏外ならオフライン扱いにする', () => {
    const read = resolveOfflineRead({
      ...base,
      online: false,
      data: ['既存'],
      dataUpdatedAt: 100,
      error: networkError,
      isFetchNextPageError: true,
    })
    expect(read.stale).toBe(true)
  })

  it('キャッシュが無ければ空配列にせず、取得エラーを返す', () => {
    const read = resolveOfflineRead<string[]>({ ...base, data: undefined, error: networkError })
    expect(read.data).toBeUndefined()
    expect(read.error).toBe(networkError)
    expect(read.stale).toBe(false)
  })

  it('キャッシュの読み出し中はエラーを出さず待つ', () => {
    const read = resolveOfflineRead<string[]>({
      ...base,
      data: undefined,
      error: networkError,
      cached: undefined,
    })
    expect(read.error).toBeNull()
    expect(read.loading).toBe(true)
  })

  it('圏外で取得中でもキャッシュがあれば待たずに見せる', () => {
    const read = resolveOfflineRead({
      ...base,
      online: false,
      data: undefined,
      isLoading: true,
      cached: { data: ['古い'], syncedAt: 50 },
    })
    expect(read.loading).toBe(false)
    expect(read.data).toEqual(['古い'])
  })

  it('取得済みのデータが残っていて再取得に失敗したら、その取得時刻を出す', () => {
    const read = resolveOfflineRead({ ...base, data: ['前回'], dataUpdatedAt: 80, error: networkError })
    expect(read).toEqual({ data: ['前回'], stale: true, syncedAt: 80, error: null, loading: false })
  })

  it('取得済みのデータがあっても圏外ならその旨を出す', () => {
    const read = resolveOfflineRead({ ...base, online: false, data: ['前回'], dataUpdatedAt: 80 })
    expect(read.stale).toBe(true)
    expect(read.syncedAt).toBe(80)
  })

  it('アクセス権のエラーはキャッシュで隠さない', () => {
    const denied = httpError(403)
    const read = resolveOfflineRead({
      ...base,
      data: undefined,
      error: denied,
      cached: { data: ['古い'], syncedAt: 50 },
    })
    expect(read.data).toBeUndefined()
    expect(read.error).toBe(denied)
    expect(read.stale).toBe(false)
  })

  it('同期時刻はいちばん古いものを出す', () => {
    expect(oldestSyncedAt([{ syncedAt: 300 }, { syncedAt: null }, { syncedAt: 100 }])).toBe(100)
    expect(oldestSyncedAt([{ syncedAt: null }])).toBeNull()
  })
})

describe('キャッシュの直列化', () => {
  const message = (index: number) => ({
    id: `m${index}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  })

  it('メッセージは新しいほうから上限件数だけ、古い順で残す', () => {
    const messages = Array.from({ length: MAX_CACHED_MESSAGES + 10 }, (_, index) => message(index))
    const saved = JSON.parse(
      serializeCachePayload({ type: 'messages', channelId: 'c1' }, [...messages].reverse()),
    ) as { id: string }[]
    expect(saved).toHaveLength(MAX_CACHED_MESSAGES)
    expect(saved[0]?.id).toBe('m10')
    expect(saved.at(-1)?.id).toBe(`m${MAX_CACHED_MESSAGES + 9}`)
  })

  it('通知は先頭から上限件数だけ残す', () => {
    const items = Array.from({ length: MAX_CACHED_NOTIFICATIONS + 1 }, (_, id) => ({ id }))
    const saved = JSON.parse(serializeCachePayload({ type: 'notifications' }, items)) as unknown[]
    expect(saved).toHaveLength(MAX_CACHED_NOTIFICATIONS)
  })

  it('保存した行を読み戻せる', () => {
    const payload = serializeCachePayload({ type: 'channel-list', kind: 'dm' }, [{ id: 'dm-1' }])
    expect(parseCacheRow({ payload, synced_at: 123 })).toEqual({
      data: [{ id: 'dm-1' }],
      syncedAt: 123,
    })
  })

  it('読めない行はキャッシュなしとして扱う', () => {
    expect(parseCacheRow(null)).toBeNull()
    expect(parseCacheRow({ payload: '{壊れた', synced_at: 1 })).toBeNull()
    expect(parseCacheRow({ payload: '{"id":1}', synced_at: 1 })).toBeNull()
    expect(parseCacheRow({ payload: '[]', synced_at: Number.NaN })).toBeNull()
  })
})

describe('キャッシュのSQL', () => {
  it('一覧はユーザー × ワークスペース × 種別で読む', () => {
    expect(selectCacheStatement({ type: 'channel-list', kind: 'project' }, scope)).toEqual({
      sql: 'SELECT payload, synced_at FROM cached_channel_lists WHERE user_id = ? AND workspace_key = ? AND kind = ?',
      params: ['user-1', 'ws-1', 'project'],
    })
  })

  it('ワークスペース未選択は既定の枠で読む', () => {
    const { params } = selectCacheStatement(
      { type: 'notifications' },
      { userId: 'user-1', workspaceId: null },
    )
    expect(params).toEqual(['user-1', 'default'])
  })

  it('メッセージはユーザーをキーに含める', () => {
    expect(selectCacheStatement({ type: 'messages', channelId: 'c1' }, scope).params).toEqual([
      'user-1',
      'c1',
    ])
  })

  it('一覧の保存は行を置き換えるだけで、他の行を消さない', () => {
    const statements = upsertCacheStatements({ type: 'notifications' }, scope, '[]', 10)
    expect(statements).toEqual([
      {
        sql: 'INSERT OR REPLACE INTO cached_notifications (user_id, workspace_key, payload, synced_at) VALUES (?, ?, ?, ?)',
        params: ['user-1', 'ws-1', '[]', 10],
      },
    ])
  })

  it('メッセージの保存は最近同期したチャンネルだけを残す', () => {
    const statements = upsertCacheStatements({ type: 'messages', channelId: 'c1' }, scope, '[]', 10)
    expect(statements).toHaveLength(2)
    expect(statements[0]?.params).toEqual(['user-1', 'c1', '[]', 10])
    expect(statements[1]?.sql).toContain('ORDER BY synced_at DESC LIMIT ?')
    expect(statements[1]?.params).toEqual(['user-1', 'user-1', MAX_CACHED_CHANNELS])
  })

  it('個別の削除は対象の行だけを指す', () => {
    expect(deleteCacheStatement({ type: 'messages', channelId: 'c1' }, scope)).toEqual({
      sql: 'DELETE FROM cached_messages WHERE user_id = ? AND channel_id = ?',
      params: ['user-1', 'c1'],
    })
  })

  it('サインアウトでは 3 つの表からそのユーザーの行を消す', () => {
    const statements = deleteUserCacheStatements('user-1')
    expect(statements.map((statement) => statement.sql)).toEqual([
      'DELETE FROM cached_channel_lists WHERE user_id = ?',
      'DELETE FROM cached_messages WHERE user_id = ?',
      'DELETE FROM cached_notifications WHERE user_id = ?',
    ])
    expect(statements.every((statement) => statement.params[0] === 'user-1')).toBe(true)
  })

  it('サインアウトの確定では全ユーザーの行を消す', () => {
    expect(deleteAllCacheStatements()).toEqual([
      { sql: 'DELETE FROM cached_channel_lists', params: [] },
      { sql: 'DELETE FROM cached_messages', params: [] },
      { sql: 'DELETE FROM cached_notifications', params: [] },
    ])
  })

  it('別ユーザーへの切り替えでは今のユーザー以外の行を消す', () => {
    const statements = deleteOtherUsersCacheStatements('user-2')
    expect(statements).toHaveLength(3)
    expect(statements[0]).toEqual({
      sql: 'DELETE FROM cached_channel_lists WHERE user_id <> ?',
      params: ['user-2'],
    })
  })
})

describe('スコープとキー', () => {
  it('対象ごとに別のキーになる', () => {
    expect(offlineCacheTargetKey({ type: 'channel-list', kind: 'dm' })).toBe('channel-list:dm')
    expect(offlineCacheTargetKey({ type: 'messages', channelId: 'c1' })).toBe('messages:c1')
    expect(offlineCacheTargetKey({ type: 'notifications' })).toBe('notifications')
  })

  it('取得中にワークスペースが変わったら同じスコープとして扱わない', () => {
    expect(isSameOfflineCacheScope(scope, { ...scope })).toBe(true)
    expect(isSameOfflineCacheScope(scope, { ...scope, workspaceId: 'ws-2' })).toBe(false)
    expect(isSameOfflineCacheScope(scope, { ...scope, userId: 'user-2' })).toBe(false)
    expect(isSameOfflineCacheScope(null, scope)).toBe(false)
  })
})

describe('最終同期の表示', () => {
  it('同じ日なら時刻だけを出す', () => {
    const now = new Date(2026, 10, 1, 18, 0)
    expect(formatLastSynced(new Date(2026, 10, 1, 9, 5).getTime(), now)).toBe('09:05')
  })

  it('前日以前は日付も出す', () => {
    const now = new Date(2026, 10, 1, 18, 0)
    expect(formatLastSynced(new Date(2026, 9, 30, 21, 40).getTime(), now)).toBe('10/30 21:40')
  })
})

describe('回線復帰', () => {
  it('圏外からオンラインになったときだけ復帰とみなす', () => {
    expect(isNetworkRecovery(false, true)).toBe(true)
    expect(isNetworkRecovery(true, true)).toBe(false)
    expect(isNetworkRecovery(true, false)).toBe(false)
    expect(isNetworkRecovery(false, false)).toBe(false)
  })
})
