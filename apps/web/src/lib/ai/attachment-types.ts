// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// AIアシスタントの添付で受け付ける形式と上限。クライアント（選んだ時点の確認）とサーバーの両方で使う

export const AI_ATTACHMENT_MAX_FILES = 5
export const AI_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

export const AI_ATTACHMENT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
export const AI_ATTACHMENT_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
])

/** ファイル選択ダイアログの絞り込み */
export const AI_ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.docx,.xlsx,.pptx,.txt,.md,.csv'

export function isAiAttachmentType(mimeType: string): boolean {
  return AI_ATTACHMENT_IMAGE_TYPES.has(mimeType) || AI_ATTACHMENT_DOCUMENT_TYPES.has(mimeType)
}
