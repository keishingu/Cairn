import type { MessageType } from '@cairn/shared'

/** プロフィールシートを開く相手。メッセージの送信者から作る */
export interface ProfileSheetTarget {
  userId: string
  displayName: string
  avatarUrl: string | null
  /** 自分がブロック済みか（メッセージの blocked フラグ由来） */
  blocked: boolean
}

export interface ProfileSheetSource {
  messageType: MessageType
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  blocked?: boolean
}

/** システムメッセージには送信者がいないため、プロフィールシートを開かない */
export function profileSheetTargetFromMessage(message: ProfileSheetSource): ProfileSheetTarget | null {
  if (message.messageType === 'system' || !message.senderId) return null
  return {
    userId: message.senderId,
    displayName: message.senderName,
    avatarUrl: message.senderAvatarUrl,
    blocked: message.blocked === true,
  }
}

export type ProfileSheetAction = 'dm' | 'mention' | 'block' | 'unblock'

export interface ProfileSheetActionInput {
  meId: string | null | undefined
  targetId: string
  blocked: boolean
  /** ワークスペースメンバー一覧に相手がいるか。一覧が未取得・取得失敗なら null（判定せずサーバーに委ねる） */
  isActiveMember: boolean | null
  dmEnabled: boolean
  /** このチャンネルの入力欄で相手をメンションできるか（入力欄が使えない・DM・候補外なら false） */
  canMention: boolean
}

/**
 * 表示する操作を決める。表示の補助であり、権限の最終判定は常にサーバーが行う。
 * - 自分自身には操作を出さない（自分のIDが未取得のときも誤操作を避けて出さない）
 * - 有効なメンバーではない相手には DM・メンションを出さない（サーバーも 422 で拒否する）
 * - ブロック中の相手とは DM できない（サーバーが 403）。代わりに解除を出す
 */
export function profileSheetActions(input: ProfileSheetActionInput): ProfileSheetAction[] {
  if (!input.meId || input.meId === input.targetId) return []
  const actions: ProfileSheetAction[] = []
  const notMember = input.isActiveMember === false
  if (input.dmEnabled && !input.blocked && !notMember) actions.push('dm')
  if (input.canMention && !notMember) actions.push('mention')
  if (input.blocked) actions.push('unblock')
  else if (!notMember) actions.push('block')
  return actions
}

/**
 * このチャンネルで相手をメンション候補にできるか。
 * 入力欄が使える（アクセス拒否・セッション切れでない）、DM ではない、候補の集合に含まれる、がすべて必要。
 * 候補の集合が未取得のときは false にして、挿入できないメンションを出さない。
 */
export function canMentionUser(input: {
  composerAvailable: boolean
  channelType: 'project' | 'workspace' | 'dm' | undefined
  targetId: string
  mentionableUserIds: ReadonlySet<string> | null
}): boolean {
  if (!input.composerAvailable || input.channelType === 'dm') return false
  return input.mentionableUserIds?.has(input.targetId) === true
}
