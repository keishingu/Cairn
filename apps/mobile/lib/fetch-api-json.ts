import { apiFetch } from './api-fetch'

/** status を保持し、通信失敗（キャッシュを見せる）とサーバーの拒否（見せない）を区別する */
export class ApiRequestError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

export async function fetchApiJson<T>(path: string, errorLabel: string): Promise<T> {
  const res = await apiFetch(path)
  if (!res.ok) {
    const message = errorLabel.includes('{status}')
      ? errorLabel.replaceAll('{status}', String(res.status))
      : `${errorLabel}の取得に失敗しました (${res.status})`
    throw new ApiRequestError(message, res.status)
  }
  return res.json() as Promise<T>
}
