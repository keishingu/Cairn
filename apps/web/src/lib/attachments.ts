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
  return mimeType
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
