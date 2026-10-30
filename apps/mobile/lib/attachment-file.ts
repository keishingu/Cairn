export function isImageMime(mimeType: string | null | undefined): boolean {
  return typeof mimeType === 'string' && mimeType.startsWith('image/')
}

// チャットの画像サムネイルの最大辺。Web の ChatMessage（chat-thread.tsx）と同じく、1枚だけなら 280、複数なら 160
export const CHAT_IMAGE_MAX_SINGLE = 280
export const CHAT_IMAGE_MAX_MULTI = 160

// 縦横比を保って max 四方に収める。Web の maxWidth / maxHeight（auto）と同じく拡大はしない
export function fitImageSize(width: number, height: number, max: number): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null
  const scale = Math.min(1, max / width, max / height)
  return { width: width * scale, height: height * scale }
}

export function isPdfMime(mimeType: string | null | undefined): boolean {
  return mimeType === 'application/pdf'
}

// アップロードで受け付ける形式に合わせる（PowerPoint は .pptx のみ。apps/web/src/lib/attachments.ts）
const OFFICE_EXTENSIONS = /\.(docx?|xlsx?|pptx)$/i

// Word / Excel / PowerPoint。iOS の WebView はキャッシュしたファイルの拡張子で描画方法を決めるため、
// MIME ではなく拡張子だけで判定する（MIME だけ Office で名前が .html などのファイルを HTML として開かせない）
export function isOfficeDocument(fileName: string): boolean {
  return OFFICE_EXTENSIONS.test(fileName)
}

// Web のテキストプレビュー（files.tsx / chat-detail-sidebar.tsx）と同じ判定。.txt は MIME に関係なく Markdown として描画しない
const MARKDOWN_EXTENSIONS = /\.(md|markdown)$/i

export function isMarkdownDocument(mimeType: string | null | undefined, fileName: string): boolean {
  if (/\.txt$/i.test(fileName)) return false
  return mimeType === 'text/markdown' || MARKDOWN_EXTENSIONS.test(fileName)
}

export type AttachmentViewer = 'image' | 'pdf' | 'markdown' | 'office'

// 画面内で開くときのビューア。null は共有シートで外部アプリに渡す。
// 画像と PDF は MIME を優先し、拡張子だけ Office の画像などを WebView で開いて失敗させない。
// Markdown は取得した本文を HTML にして描画するため両 OS で開ける。
// Office ファイルは iOS の WebView（OS 標準のプレビュー）だけが表示できるため iOS に限る
export function attachmentViewer(
  mimeType: string | null | undefined,
  fileName: string,
  platform: string,
): AttachmentViewer | null {
  if (isPdfMime(mimeType)) return 'pdf'
  if (isImageMime(mimeType)) return 'image'
  if (isMarkdownDocument(mimeType, fileName)) return 'markdown'
  if (platform === 'ios' && isOfficeDocument(fileName)) return 'office'
  return null
}

export function isPreviewableAttachment(
  mimeType: string | null | undefined,
  fileName: string,
  platform: string,
): boolean {
  return attachmentViewer(mimeType, fileName, platform) !== null
}

export function attachmentCacheFileName(fileId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.\-]/g, '_') || 'file'
  return `${fileId}_${safeName}`
}

export function shouldReuseCachedFile(info: { exists: boolean; size?: number }): boolean {
  return info.exists && (info.size ?? 0) > 0
}
