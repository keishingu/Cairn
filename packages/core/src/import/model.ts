// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * 外部チャットサービスからの取り込みに使う共通モデル。
 * 取り込み元ごとの Parser（いまは Teams 個人用だけ）がこの形に変換し、
 * Cairn への書き込みはこの形だけを見る。Slack / Discord を足すときは Parser だけを増やす。
 *
 * - ID はすべて取り込み元のもの。Cairn の ID への変換は書き込み側で行う
 * - 取り込み元で分からない情報は推定で埋めない（投稿者不明は `anonymous`、返信先不明は `null`）
 */

export const IMPORT_SOURCES = ['teams-consumer'] as const
export type ImportSource = (typeof IMPORT_SOURCES)[number]

/** 投稿者・リアクションした人。取り込み元での識別子ごとに1件 */
export interface ImportIdentity {
  /**
   * 取り込み元の中で一意なキー。
   * `mri:<id>`（取り込み元のユーザー ID）、`name:<表示名>`（ID が無く名前だけ分かる）、`anonymous`（区別できない）
   */
  key: string
  /** 取り込み元の表示名。分からなければ null（推定しない） */
  displayName: string | null
  /** 誰か区別できない投稿者をまとめたもの。Cairn ユーザーへの紐づけはできない */
  anonymous: boolean
  /** どう判明した人か。紐づけ候補を出すときの参考にだけ使う */
  kind: 'exporter' | 'named' | 'unnamed-participant' | 'anonymous'
}

export type ImportConversationKind = 'group' | 'one-on-one' | 'meeting' | 'other'

export interface ImportConversation {
  externalId: string
  kind: ImportConversationKind
  /** 取り込み元の会話名。空なら null */
  name: string | null
  memberCount: number
  /** 取り込みの対象にできるか。MVP はグループ会話だけ（1対1・会議は相手の同意が要るため対象外） */
  importable: boolean
  firstMessageAt: string | null
  lastMessageAt: string | null
}

export interface ImportReaction {
  identityKey: string
  /** Cairn に保存する絵文字（Unicode）。対応表に無いものは `:key:` の文字列 */
  emoji: string
  /** 取り込み元のリアクション名 */
  sourceKey: string
  reactedAt: string
}

export interface ImportMediaRef {
  /** 取り込み元のメディア ID（Teams は AMS オブジェクト ID） */
  objectId: string
}

/** 実体がエクスポートに含まれないファイル（OneDrive の共有リンクなど） */
export interface ImportExternalFile {
  fileName: string
  /** https の URL だけ。無ければ null（アップロード失敗など） */
  url: string | null
  uploadError: boolean
}

export interface ImportMessage {
  externalId: string
  conversationExternalId: string
  identityKey: string
  /** 元の投稿日時（ISO 8601, UTC） */
  sentAt: string
  /** 最後に編集された日時。編集履歴は取り込み元に無い */
  editedAt: string | null
  /** Cairn の本文（Markdown として表示される。HTML は含まない） */
  text: string
  /** 取り込み元で確認できる引用元のメッセージ ID（同じ会話内）。スレッドの推定はしない */
  quotedExternalId: string | null
  reactions: ImportReaction[]
  media: ImportMediaRef[]
  externalFiles: ImportExternalFile[]
  /** 取り込み元の属性（投稿者の照合を後でやり直すために残す） */
  attributes: {
    messageType: string
    senderIdPresent: boolean
    senderNamePresent: boolean
    hasSubject: boolean
    isEventCard: boolean
    mentionCount: number
  }
}

export type ImportSkipReason =
  | 'deleted'
  | 'system'
  | 'call'
  | 'empty'
  | 'unsupported-type'

export interface ImportSkippedMessage {
  conversationExternalId: string
  externalId: string
  reason: ImportSkipReason
}

export interface ImportBundle {
  source: ImportSource
  exportedAt: string | null
  /** エクスポートした本人の identity key */
  exporterKey: string | null
  identities: ImportIdentity[]
  conversations: ImportConversation[]
  /** 会話 ID → 取り込めるメッセージ（投稿日時の昇順） */
  messagesByConversation: Record<string, ImportMessage[]>
  skipped: ImportSkippedMessage[]
}

/** 何が取り込まれないかを利用者に見せるための集計 */
export interface ImportLossSummary {
  messages: number
  anonymousMessages: number
  editedMessages: number
  deletedSkipped: number
  systemSkipped: number
  emptySkipped: number
  unsupportedSkipped: number
  reactions: number
  mediaRefs: number
  externalFiles: number
  externalFilesWithoutUrl: number
  quotes: number
  mentions: number
}

export function summarizeConversation(bundle: ImportBundle, conversationExternalId: string): ImportLossSummary {
  const messages = bundle.messagesByConversation[conversationExternalId] ?? []
  const anonymousKeys = new Set(bundle.identities.filter(i => i.anonymous).map(i => i.key))
  const skipped = bundle.skipped.filter(s => s.conversationExternalId === conversationExternalId)
  const count = (reason: ImportSkipReason) => skipped.filter(s => s.reason === reason).length
  return {
    messages: messages.length,
    anonymousMessages: messages.filter(m => anonymousKeys.has(m.identityKey)).length,
    editedMessages: messages.filter(m => m.editedAt).length,
    deletedSkipped: count('deleted'),
    systemSkipped: count('system') + count('call'),
    emptySkipped: count('empty'),
    unsupportedSkipped: count('unsupported-type'),
    reactions: messages.reduce((n, m) => n + m.reactions.length, 0),
    mediaRefs: messages.reduce((n, m) => n + m.media.length, 0),
    externalFiles: messages.reduce((n, m) => n + m.externalFiles.length, 0),
    externalFilesWithoutUrl: messages.reduce((n, m) => n + m.externalFiles.filter(f => !f.url).length, 0),
    quotes: messages.filter(m => m.quotedExternalId).length,
    mentions: messages.reduce((n, m) => n + m.attributes.mentionCount, 0),
  }
}
