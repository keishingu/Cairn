export function isImageMime(mimeType: string | null | undefined): boolean {
  return typeof mimeType === 'string' && mimeType.startsWith('image/')
}

export function isPdfMime(mimeType: string | null | undefined): boolean {
  return mimeType === 'application/pdf'
}

// 画面内で開ける添付。それ以外は共有シートで外部アプリに渡す
export function isPreviewableAttachment(mimeType: string | null | undefined): boolean {
  return isImageMime(mimeType) || isPdfMime(mimeType)
}

export function attachmentCacheFileName(fileId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.\-]/g, '_') || 'file'
  return `${fileId}_${safeName}`
}

export function shouldReuseCachedFile(info: { exists: boolean; size?: number }): boolean {
  return info.exists && (info.size ?? 0) > 0
}
