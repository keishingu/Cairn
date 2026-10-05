export function isImageMime(mimeType: string | null | undefined): boolean {
  return typeof mimeType === 'string' && mimeType.startsWith('image/')
}

export function isPdfMime(mimeType: string | null | undefined): boolean {
  return mimeType === 'application/pdf'
}

const OFFICE_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])
const OFFICE_EXTENSIONS = /\.(docx?|xlsx?|pptx?)$/i

// Word / Excel / PowerPoint。アップロード時に MIME が汎用（octet-stream など）になる場合があるため拡張子でも判定する
export function isOfficeDocument(mimeType: string | null | undefined, fileName: string): boolean {
  return (typeof mimeType === 'string' && OFFICE_MIME_TYPES.has(mimeType)) || OFFICE_EXTENSIONS.test(fileName)
}

// 画面内で開ける添付。それ以外は共有シートで外部アプリに渡す。
// Office ファイルは iOS の WebView（OS 標準のプレビュー）だけが表示できるため iOS に限る
export function isPreviewableAttachment(
  mimeType: string | null | undefined,
  fileName: string,
  platform: string,
): boolean {
  return (
    isImageMime(mimeType) ||
    isPdfMime(mimeType) ||
    (platform === 'ios' && isOfficeDocument(mimeType, fileName))
  )
}

export function attachmentCacheFileName(fileId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.\-]/g, '_') || 'file'
  return `${fileId}_${safeName}`
}

export function shouldReuseCachedFile(info: { exists: boolean; size?: number }): boolean {
  return info.exists && (info.size ?? 0) > 0
}
