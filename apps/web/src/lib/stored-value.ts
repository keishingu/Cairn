// タブ・スコープの選択は localStorage に端末ごとに保存する。保存値が無い・不正なら既定値。
export function loadStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const value = localStorage.getItem(key)
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

export function storeValue(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* 保存できなくても表示は切り替える */ }
}
