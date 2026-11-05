// 添付できる書類の形式（ピッカーの絞り込みと、共有の受け取りの判定で使う）
export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
  'text/markdown',
]

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

// 端末のファイル名は 255 バイトまで。取得中は `.download` を付けた一時ファイルに書くため、その分も残す
const MAX_CACHE_FILE_NAME_LENGTH = 255 - '.download'.length

export function attachmentCacheFileName(fileId: string, fileName: string): string {
  // ASCII 以外も _ に置き換えるため、文字数がそのままバイト数になる
  const safeName = fileName.replace(/[^\w.\-]/g, '_') || 'file'
  const full = `${fileId}_${safeName}`
  if (full.length <= MAX_CACHE_FILE_NAME_LENGTH) return full
  // 長すぎる名前は、ビューアが形式の判定に使う拡張子を残して本体を切り詰める
  const dot = safeName.lastIndexOf('.')
  const extension = dot > 0 && safeName.length - dot <= 16 ? safeName.slice(dot) : ''
  const stemLength = Math.max(1, MAX_CACHE_FILE_NAME_LENGTH - fileId.length - 1 - extension.length)
  return `${fileId}_${safeName.slice(0, stemLength)}${extension}`.slice(0, MAX_CACHE_FILE_NAME_LENGTH)
}

export function shouldReuseCachedFile(info: { exists: boolean; size?: number }): boolean {
  return info.exists && (info.size ?? 0) > 0
}
