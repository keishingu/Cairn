// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/** チャット一覧の1行が持つ未読件数（API の DTO と同じ名前） */
export interface ChatUnreadCounts {
  unreadCount: number
  unreadMentionCount: number
}

/**
 * チャット一覧の行の表示。
 * 件数バッジは自分宛て（メンション・DM）だけに付け、それ以外の新着は名前の太字だけで示す。
 * 全新着に件数バッジを付けると、急ぎでない会話まで開いて消したくなるため。
 * DM は全メッセージが自分宛てなので未読数をそのままバッジにする。
 */
export function chatUnreadDisplay(
  counts: ChatUnreadCounts,
  { directMessage = false }: { directMessage?: boolean } = {},
): { unread: boolean; badgeCount: number } {
  const badgeCount = directMessage ? counts.unreadCount : counts.unreadMentionCount
  return {
    unread: counts.unreadCount > 0 || badgeCount > 0,
    badgeCount,
  }
}
