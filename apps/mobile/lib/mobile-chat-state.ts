const TOPIC_PERMISSION_DENIED = /do not have permissions to read from this Channel topic/i

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (!error || typeof error !== 'object' || !('message' in error)) return ''
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' ? message : ''
}

export function isRealtimeUnauthorized(error: unknown): boolean {
  return TOPIC_PERMISSION_DENIED.test(errorMessage(error))
}

export function shouldRetryRealtime(
  status: string,
  error?: unknown,
  removed = false,
): boolean {
  // CHANNEL_ERROR はソケット瞬断時の通常経路。supabase-js が再 JOIN するので
  // React 側で購読を破棄して作り直さない。JOIN が決まらない TIMED_OUT と、
  // チャンネルが外された CLOSED だけアプリで作り直す。
  // topic 権限拒否はリトライしても直らない。意図的な removeChannel の CLOSED も再JOINしない。
  if (removed || isRealtimeUnauthorized(error)) return false
  return status === 'TIMED_OUT' || status === 'CLOSED'
}

export function hasFailedUploads(uploads: ReadonlyArray<{ status: string }>): boolean {
  return uploads.some((upload) => upload.status === 'error')
}
