export function isRealtimeUnauthorized(error: unknown): boolean {
  if (typeof error === 'string') return /unauthorized/i.test(error)
  if (!error || typeof error !== 'object' || !('message' in error)) return false
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && /unauthorized/i.test(message)
}

export function shouldRetryRealtime(status: string, error?: unknown): boolean {
  // CLOSED / CHANNEL_ERROR はソケット瞬断時の通常経路。supabase-js が再 JOIN するので
  // React 側で購読を破棄して作り直さない。JOIN が決まらない TIMED_OUT だけアプリで拾う。
  // Unauthorized はリトライしても直らない。
  if (isRealtimeUnauthorized(error)) return false
  return status === 'TIMED_OUT'
}

export function hasFailedUploads(uploads: ReadonlyArray<{ status: string }>): boolean {
  return uploads.some((upload) => upload.status === 'error')
}
