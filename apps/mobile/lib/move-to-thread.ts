import type { MessageType, MoveToThreadBody } from '@cairn/shared'

/** ネイティブでは「このメッセージだけ」「このメッセージ以降すべて」の2つを扱う（複数選択は Web のみ）。 */
export type MoveScope = 'single' | 'after'

/**
 * 「スレッドに切り出す」を出すか。親ワークスペースチャンネル（スレッドではない）の通常メッセージを
 * member 以上が操作するときだけ。ロールが未解決の間はゲストと同じく出さない。
 * アーカイブ済みチャンネルのスレッドには移せない（API も 400 を返す）ため出さない。
 */
export function canMoveMessageToThread(input: {
  channelType: 'project' | 'workspace' | 'dm' | undefined
  /** チャンネル一覧から引いた現在のチャンネル。一覧未取得・該当なしは undefined */
  workspaceChannel: { parentChannelId?: string | null; archived?: boolean } | undefined
  role: 'owner' | 'admin' | 'member' | 'guest' | undefined
  messageType: MessageType
}): boolean {
  if (input.channelType !== 'workspace') return false
  if (!input.workspaceChannel || input.workspaceChannel.parentChannelId) return false
  if (input.workspaceChannel.archived === true) return false
  if (input.messageType === 'system') return false
  return input.role === 'owner' || input.role === 'admin' || input.role === 'member'
}

export function buildMoveBody(
  scope: MoveScope,
  messageId: string,
  destination: { kind: 'new'; name: string } | { kind: 'existing'; threadId: string },
): MoveToThreadBody {
  const range = scope === 'after' ? { fromMessageId: messageId } : { messageIds: [messageId] }
  return destination.kind === 'new'
    ? { ...range, threadName: destination.name.trim() }
    : { ...range, threadId: destination.threadId }
}
