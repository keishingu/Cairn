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

export function shouldRetryRealtime(status: string, error?: unknown): boolean {
  // CHANNEL_ERROR はソケット瞬断。supabase-js が再 JOIN するのでアプリでは作り直さない。
  // user トピックの CLOSED / TIMED_OUT だけ作り直す。
  // チャンネルトピックは removeChannel も CLOSED を飛ばすので、この関数を使わない。
  if (isRealtimeUnauthorized(error)) return false
  return status === 'TIMED_OUT' || status === 'CLOSED'
}

export function hasFailedUploads(uploads: ReadonlyArray<{ status: string }>): boolean {
  return uploads.some((upload) => upload.status === 'error')
}
