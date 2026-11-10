/**
 * 未保存のテキスト下書きの保存先（localStorage）。
 *
 * 画面遷移やパネルを閉じる操作を止めずに下書きを失わないため、編集中の値を編集対象ごとに端末へ残し、
 * 同じ欄を開き直したときに復元を案内する。保存（サーバー反映）は従来どおり明示的な「保存」だけで行う。
 *
 * キー: `cairn:draft:{userId}:{workspaceId}:{key}`。ユーザー・ワークスペースで名前空間を分け、
 * 別の人・別のワークスペースの下書きが混ざらないようにする。
 * 保存領域が使えない（無効化・容量超過・プライベートブラウズ）ときは、下書き機能が無いのと同じ挙動にする。
 */

export const DRAFT_KEY_PREFIX = 'cairn:draft:'

/** 下書きの有効期間。これより古いものは読み取り時に捨てる。 */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface DraftScope {
  userId: string
  workspaceId: string
}

export interface DraftEntry {
  /** 編集中の値 */
  value: string
  /** 編集を始めたときの保存済みの値。復元時に保存済みの値が変わっていないかの判定に使う。 */
  base: string
  /** 最後に書いた時刻（ミリ秒） */
  updatedAt: number
}

export function draftStorageKey(scope: DraftScope, key: string): string {
  return `${DRAFT_KEY_PREFIX}${scope.userId}:${scope.workspaceId}:${key}`
}

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function parseEntry(raw: string | null): DraftEntry | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { value, base, updatedAt } = parsed as Record<string, unknown>
    if (typeof value !== 'string' || typeof base !== 'string' || typeof updatedAt !== 'number') return null
    return { value, base, updatedAt }
  } catch {
    return null
  }
}

function isExpired(entry: DraftEntry, now: number): boolean {
  return now - entry.updatedAt > DRAFT_TTL_MS
}

/** 下書きを読む。期限切れ・壊れた値は読み取り時に削除して null を返す。 */
export function readDraft(scope: DraftScope, key: string, now: number = Date.now()): DraftEntry | null {
  const storage = getStorage()
  if (!storage) return null
  const storageKey = draftStorageKey(scope, key)
  try {
    const raw = storage.getItem(storageKey)
    if (raw === null) return null
    const entry = parseEntry(raw)
    if (!entry || isExpired(entry, now)) {
      storage.removeItem(storageKey)
      return null
    }
    return entry
  } catch {
    return null
  }
}

/** 下書きを書く。書けなかった（容量超過など）ときは false。 */
export function writeDraft(scope: DraftScope, key: string, entry: DraftEntry): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    storage.setItem(draftStorageKey(scope, key), JSON.stringify(entry))
    return true
  } catch {
    return false
  }
}

export function removeDraft(scope: DraftScope, key: string): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(draftStorageKey(scope, key))
  } catch {
    /* 削除できなくても表示は続ける */
  }
}

function collectKeys(storage: Storage, prefix: string): string[] {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k !== null && k.startsWith(prefix)) keys.push(k)
  }
  return keys
}

/** 期限切れの下書きをすべて削除する（全ユーザー分。他人の下書きでも期限切れなら不要）。 */
export function pruneExpiredDrafts(now: number = Date.now()): void {
  const storage = getStorage()
  if (!storage) return
  try {
    for (const k of collectKeys(storage, DRAFT_KEY_PREFIX)) {
      const entry = parseEntry(storage.getItem(k))
      if (!entry || isExpired(entry, now)) storage.removeItem(k)
    }
  } catch {
    /* 掃除に失敗しても読み取り時に捨てられる */
  }
}

/** そのユーザーの下書きを（ワークスペースを問わず）すべて削除する。サインアウト時に使う。 */
export function clearUserDrafts(userId: string): void {
  const storage = getStorage()
  if (!storage) return
  try {
    for (const k of collectKeys(storage, `${DRAFT_KEY_PREFIX}${userId}:`)) storage.removeItem(k)
  } catch {
    /* 共有端末の個人データなので、失敗は握りつぶさず呼び出し側に影響させない範囲で諦める */
  }
}
