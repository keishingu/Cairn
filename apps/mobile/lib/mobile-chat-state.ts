export function shouldRetryRealtime(status: string): boolean {
  // CLOSED / CHANNEL_ERROR はソケット瞬断時の通常経路。supabase-js が再 JOIN するので
  // React 側で購読を破棄して作り直さない。JOIN が決まらない TIMED_OUT だけアプリで拾う。
  return status === 'TIMED_OUT'
}

export function hasFailedUploads(uploads: ReadonlyArray<{ status: string }>): boolean {
  return uploads.some((upload) => upload.status === 'error')
}
