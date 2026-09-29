export function isImageMime(mimeType: string | null | undefined): boolean {
  return typeof mimeType === 'string' && mimeType.startsWith('image/')
}

export function attachmentCacheFileName(fileId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.\-]/g, '_') || 'file'
  return `${fileId}_${safeName}`
}

export function shouldReuseCachedFile(info: { exists: boolean; size?: number }): boolean {
  return info.exists && (info.size ?? 0) > 0
}
