import { apiFetch } from './api-fetch'

export async function fetchApiJson<T>(path: string, errorLabel: string): Promise<T> {
  const res = await apiFetch(path)
  if (!res.ok) {
    const message = errorLabel.includes('{status}')
      ? errorLabel.replaceAll('{status}', String(res.status))
      : `${errorLabel}の取得に失敗しました (${res.status})`
    throw new Error(message)
  }
  return res.json() as Promise<T>
}
