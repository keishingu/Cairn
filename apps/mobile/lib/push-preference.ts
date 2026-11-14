// 通知一覧のスイッチでオフにしたかどうか。サーバーの登録はユーザーごとなので、端末内でもユーザーごとに持つ
export function pushEnabledStorageKey(userId: string): string {
  return `cairn:push_enabled_mobile:${userId}`
}

// オフにしたがサーバーの登録をまだ外せていない状態。外せるまで起動時と表示更新のたびに解除を送り直す
const OFF_PENDING_REMOVAL = 'off-pending'

export interface PushPreferenceStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

export interface PushSetting {
  enabled: boolean
  /** オフにしたが、サーバーの登録の解除がまだ終わっていない */
  removalPending: boolean
}

/** 未設定はオン扱い。初回起動では許可を求め、許可されればそのまま通知を受け取る */
export function readPushSetting(value: string | null): PushSetting {
  if (value === OFF_PENDING_REMOVAL) return { enabled: false, removalPending: true }
  return { enabled: value !== 'false', removalPending: false }
}

export async function loadPushSetting(userId: string, storage: PushPreferenceStorage): Promise<PushSetting> {
  return readPushSetting(await storage.getItem(pushEnabledStorageKey(userId)))
}

export async function loadPushEnabled(userId: string, storage: PushPreferenceStorage): Promise<boolean> {
  return (await loadPushSetting(userId, storage)).enabled
}

type PushPreferenceListener = (userId: string, source: unknown) => void
const listeners = new Set<PushPreferenceListener>()

/** スイッチは通知パネルと通知画面の両方にあるため、片方で変えたらもう片方にも知らせる */
export function subscribePushPreference(listener: PushPreferenceListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * オフは解除が終わるまで「解除待ち」として保存する。アプリが終了したり解除に失敗したりしても、
 * 次の起動や表示更新で解除を送り直せる。source は変更元で、通知を受けた側が自分の変更を見分けるのに使う
 */
export async function savePushEnabled(
  userId: string,
  enabled: boolean,
  storage: PushPreferenceStorage,
  source?: unknown,
): Promise<void> {
  await storage.setItem(pushEnabledStorageKey(userId), enabled ? 'true' : OFF_PENDING_REMOVAL)
  for (const listener of listeners) listener(userId, source)
}

/**
 * 解除待ちなら解除を送り、終わったら単なるオフに戻す。解除中にオンへ戻されていれば上書きしない。
 * 解除待ちでなければ何もしない。失敗は呼び出し側で扱う
 */
export async function completePendingRemoval(
  userId: string,
  storage: PushPreferenceStorage,
  unregister: () => Promise<void>,
): Promise<void> {
  if (!(await loadPushSetting(userId, storage)).removalPending) return
  await unregister()
  if ((await loadPushSetting(userId, storage)).removalPending) {
    await storage.setItem(pushEnabledStorageKey(userId), 'false')
  }
}
