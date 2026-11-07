// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto'

// 取り込みで作るメッセージ ID の名前空間（UUID v5）。値を変えると再実行で二重登録になるので変えない
const IMPORT_MESSAGE_NAMESPACE = '6b1f6a3e-6f0c-4d4e-9a0a-1c2d3e4f5a6b'

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex')
}

/** RFC 4122 の UUID v5（SHA-1 による名前ベース） */
export function uuidV5(name: string, namespace: string = IMPORT_MESSAGE_NAMESPACE): string {
  const hash = createHash('sha1').update(uuidToBytes(namespace)).update(name, 'utf8').digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * 取り込むメッセージの Cairn 側の ID。ワークスペース・取り込み元・会話 ID・メッセージ ID から決める。
 * 同じメッセージを何度取り込んでも（別の参加者のエクスポートでも）同じ ID になり、二重登録されない。
 * メッセージ ID は会話の範囲でしか一意と限らないので、会話 ID と組にする。
 */
export function importedMessageId(workspaceId: string, source: string, conversationId: string, messageId: string): string {
  return uuidV5(`${workspaceId}\n${source}\n${conversationId}\n${messageId}`)
}
