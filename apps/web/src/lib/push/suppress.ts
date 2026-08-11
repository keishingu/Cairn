// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export interface ReadStateSnapshot {
  lastReadAt: Date | null
  lastReadMessageId: string | null
}

export interface MessageRef {
  id: string
  createdAt: Date
}

/**
 * 受信者が対象メッセージを既読済みかを判定する。
 * Push 送信前の猶予期間後に再確認し、DM の Push 抑制と、閲覧中メンションの
 * アプリアイコンバッジ抑制に使う。
 *
 * last_read_at はアプリサーバー時刻、created_at は DB 時刻のため、
 * クロックスキュー対策として last_read_message_id の一致も既読とみなす。
 */
export function hasReadMessage(
  state: ReadStateSnapshot | undefined,
  message: MessageRef,
): boolean {
  if (!state) return false
  if (state.lastReadMessageId === message.id) return true
  if (state.lastReadAt && state.lastReadAt.getTime() >= message.createdAt.getTime()) return true
  return false
}

/** 既読状態に応じて Push の宛先を分ける。 */
export function partitionRecipientsByReadState<T extends { userId: string }>(
  recipients: T[],
  states: ReadonlyMap<string, ReadStateSnapshot>,
  message: MessageRef,
): { readRecipients: T[]; unreadRecipients: T[] } {
  const readRecipients: T[] = []
  const unreadRecipients: T[] = []

  for (const recipient of recipients) {
    const target = hasReadMessage(states.get(recipient.userId), message)
      ? readRecipients
      : unreadRecipients
    target.push(recipient)
  }

  return { readRecipients, unreadRecipients }
}
