export function shouldRetryRealtime(status: string): boolean {
  return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'
}

export function hasFailedUploads(uploads: ReadonlyArray<{ status: string }>): boolean {
  return uploads.some((upload) => upload.status === 'error')
}
