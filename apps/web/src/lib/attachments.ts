// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 添付ファイルのバリデーション・MIME 正規化ロジック。
// アップロード URL 発行(upload-url) と登録(finalize) の両ルートで共有する。

export const MAX_FILE_SIZE = 10 * 1024 * 1024

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
])

// ブラウザが実体を判定できなかったときに返す汎用 MIME タイプ。
// これらは形式の手がかりにならないため、拡張子・マジックナンバーで補完する。
export const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream'])

const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
}

// Windows等では.csvファイルがExcelの登録ハンドラ経由でapplication/vnd.ms-excelとして
// 報告されることがある。またブラウザがMIMEを指定しない場合、空文字ではなく
// request.formData()のパース後にapplication/octet-streamになることがある。
// そのままだと検索インデックス対象外・XLS表示になってしまうため、
// 拡張子から明らかにCSVと分かる場合はtext/csvに正規化する
const CSV_AMBIGUOUS_MIME_TYPES = new Set(['application/vnd.ms-excel', 'application/octet-stream', ''])

export function normalizeMimeType(fileName: string, mimeType: string): string {
  if (/\.csv$/i.test(fileName) && CSV_AMBIGUOUS_MIME_TYPES.has(mimeType)) {
    return 'text/csv'
  }
  if (ALLOWED_MIME_TYPES.has(mimeType)) return mimeType

  const ext = fileName.includes('.') ? (fileName.split('.').pop()?.toLowerCase() ?? '') : ''
  if (GENERIC_MIME_TYPES.has(mimeType) && EXTENSION_TO_MIME[ext]) {
    return EXTENSION_TO_MIME[ext]
  }

  return mimeType
}

// ファイル先頭のマジックナンバーから実体の MIME タイプを判定する。
// 拡張子も無く file.type も汎用（application/octet-stream）なケースの最終手段。
export function sniffMimeType(bytes: Uint8Array): string | null {
  // PDF: "%PDF"
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf'
  }
  // PNG: 89 50 4E 47
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  // GIF: "GIF8"
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif'
  }
  // WebP: "RIFF"...."WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

export function resolveAttachmentMimeType(fileName: string, mimeType: string, bytes?: Uint8Array): string | null {
  const normalized = normalizeMimeType(fileName, mimeType)
  if (ALLOWED_MIME_TYPES.has(normalized)) return normalized
  return bytes ? sniffMimeType(bytes) : null
}

export function resolveStorageExtension(fileName: string, mimeType: string): string {
  return fileName.includes('.') ? (fileName.split('.').pop() ?? 'bin') : (MIME_TO_EXT[mimeType] ?? 'bin')
}

export function resolveFileType(mimeType: string): 'image' | 'document' | 'other' {
  if (mimeType.startsWith('image/')) return 'image'
  if (
    mimeType === 'application/pdf' ||
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mimeType === 'text/csv'
  ) return 'document'
  return 'other'
}
