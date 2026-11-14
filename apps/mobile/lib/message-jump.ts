/** 飛び先のメッセージを強調する時間（Web の `.message-highlight` と同じ） */
export const MESSAGE_HIGHLIGHT_MS = 2000

export interface MessageJumpView {
  /** 飛び先が直近のページに無いため、その前後を別に取得する必要がある */
  needsHistory: boolean
  /** 前後を取得したが飛び先が無かった（削除済み・閲覧不可） */
  historyUnavailable: boolean
  /** 直近のメッセージの代わりに、飛び先の前後を表示している */
  isHistoryView: boolean
}

/**
 * 飛び先のメッセージを直近のページで見せるか、前後を別に取得して見せるかを決める（Web の `/chats` と同じ規則）。
 * 直近のページを取得し終えるまでは判断しない（キャッシュに無いだけで履歴表示へ切り替えない）。
 */
export function resolveMessageJumpView(input: {
  jumpMessageId: string | null
  latestLoaded: boolean
  latestMessageIds: readonly string[]
  historyLoaded: boolean
  historyMessageCount: number
}): MessageJumpView {
  const needsHistory = !!input.jumpMessageId
    && input.latestLoaded
    && !input.latestMessageIds.includes(input.jumpMessageId)
  const historyUnavailable = needsHistory && input.historyLoaded && input.historyMessageCount === 0
  return { needsHistory, historyUnavailable, isHistoryView: needsHistory && !historyUnavailable }
}

/**
 * 返信の引用をタップしたときの飛び先（Web の `/chats` と同じく、返信元が削除済みなら飛ばない）。
 */
export function replyJumpTargetId(
  replyTo: { id: string; isDeleted: boolean } | null | undefined,
): string | null {
  return replyTo && !replyTo.isDeleted ? replyTo.id : null
}
