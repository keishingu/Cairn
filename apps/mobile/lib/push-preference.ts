// 通知一覧のスイッチでオフにしたかどうか。サーバーの登録はユーザーごとなので、端末内でもユーザーごとに持つ
export function pushEnabledStorageKey(userId: string): string {
  return `cairn:push_enabled_mobile:${userId}`
}

export interface PushPreferenceStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

/** 未設定はオン扱い。初回起動では許可を求め、許可されればそのまま通知を受け取る */
export function readPushEnabled(value: string | null): boolean {
  return value !== 'false'
}

export async function loadPushEnabled(userId: string, storage: PushPreferenceStorage): Promise<boolean> {
  return readPushEnabled(await storage.getItem(pushEnabledStorageKey(userId)))
}

export async function savePushEnabled(
  userId: string,
  enabled: boolean,
  storage: PushPreferenceStorage,
): Promise<void> {
  await storage.setItem(pushEnabledStorageKey(userId), String(enabled))
}
