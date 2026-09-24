import { apiFetch } from './api-fetch'

export async function fetchApiJson<T>(path: string, errorLabel: string): Promise<T> {
  const res = await apiFetch(path)
  if (!res.ok) throw new Error(`${errorLabel}の取得に失敗しました (${res.status})`)
  return res.json() as Promise<T>
}
