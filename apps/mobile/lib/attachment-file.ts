export function isImageMime(mimeType: string | null | undefined): boolean {
  return typeof mimeType === 'string' && mimeType.startsWith('image/')
}

export function isPdfMime(mimeType: string | null | undefined): boolean {
  return mimeType === 'application/pdf'
}

const OFFICE_EXTENSIONS = /\.(docx?|xlsx?|pptx?)$/i

// Word / Excel / PowerPoint。iOS の WebView はキャッシュしたファイルの拡張子で描画方法を決めるため、
// MIME ではなく拡張子だけで判定する（MIME だけ Office で名前が .html などのファイルを HTML として開かせない）
export function isOfficeDocument(fileName: string): boolean {
  return OFFICE_EXTENSIONS.test(fileName)
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
    (platform === 'ios' && isOfficeDocument(fileName))
  )
}

export function attachmentCacheFileName(fileId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.\-]/g, '_') || 'file'
  return `${fileId}_${safeName}`
}

export function shouldReuseCachedFile(info: { exists: boolean; size?: number }): boolean {
  return info.exists && (info.size ?? 0) > 0
}
