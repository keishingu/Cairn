// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 構造化メンションの保存形式は canonical な `<@id>`。
// - ユーザー: `<@userId>`
// - 全員: `<@all>`（チャンネル到達可能な active メンバー）
// - プロジェクトメンバー: `<@project_members>`（そのプロジェクトの project_members）
// - 属性: `<@attr:{attributeId}>`
// 表示名は本文に焼き込まず、read 時に最新名へ解決する。
// 旧データには `<@id|displayName>` 形式が残っているため、両方を受理する。
const MENTION_TOKEN_SOURCE = '<@([^|>\\s]+)(?:\\|([^>\\n]+))?>'

export const ALL_MENTION_ID = 'all'
export const ALL_MENTION_LABEL = 'all'
export const PROJECT_MEMBERS_MENTION_ID = 'project_members'
export const PROJECT_MEMBERS_MENTION_LABEL = 'project_members'
export const ATTR_MENTION_PREFIX = 'attr:'
export const UNKNOWN_MENTION_NAME = '不明なメンバー'
export const UNKNOWN_ATTRIBUTE_NAME = '不明な属性'

const RESERVED_MENTION_IDS = new Set([ALL_MENTION_ID, PROJECT_MEMBERS_MENTION_ID])

export function mentionTokenRegExp(): RegExp {
  return new RegExp(MENTION_TOKEN_SOURCE, 'g')
}

export function attributeMentionTokenId(attributeId: string): string {
  return `${ATTR_MENTION_PREFIX}${attributeId}`
}

export function isAllMentionId(id: string): boolean {
  return id === ALL_MENTION_ID
}

export function isProjectMembersMentionId(id: string): boolean {
  return id === PROJECT_MEMBERS_MENTION_ID
}

export function isAttributeMentionId(id: string): boolean {
  return id.startsWith(ATTR_MENTION_PREFIX) && id.length > ATTR_MENTION_PREFIX.length
}

export function isUserMentionId(id: string): boolean {
  return !RESERVED_MENTION_IDS.has(id) && !id.startsWith(ATTR_MENTION_PREFIX)
}

export function parseAttributeMentionId(id: string): string | null {
  if (!isAttributeMentionId(id)) return null
  return id.slice(ATTR_MENTION_PREFIX.length)
}

/** 本文中のユーザーメンションから userId を抽出する（予約・属性トークンは含まない・重複排除） */
export function extractMentionIds(content: string): string[] {
  const ids = [...content.matchAll(mentionTokenRegExp())]
    .map(m => m[1]!)
    .filter(isUserMentionId)
  return [...new Set(ids)]
}

/** 本文中の属性メンションから attributeId を抽出する（重複排除） */
export function extractAttributeMentionIds(content: string): string[] {
  const ids = [...content.matchAll(mentionTokenRegExp())]
    .map(m => parseAttributeMentionId(m[1]!))
    .filter((id): id is string => id !== null)
  return [...new Set(ids)]
}

export function hasAllMention(content: string): boolean {
  return [...content.matchAll(mentionTokenRegExp())].some(m => isAllMentionId(m[1]!))
}

export function hasProjectMembersMention(content: string): boolean {
  return [...content.matchAll(mentionTokenRegExp())].some(m => isProjectMembersMentionId(m[1]!))
}

export function hasGroupMention(content: string): boolean {
  return (
    hasAllMention(content)
    || hasProjectMembersMention(content)
    || extractAttributeMentionIds(content).length > 0
  )
}

export function resolveMentionDisplayName(
  id: string,
  nameOf?: (id: string) => string | undefined,
  embedded?: string,
): string {
  if (isAllMentionId(id)) return nameOf?.(id) ?? embedded ?? ALL_MENTION_LABEL
  if (isProjectMembersMentionId(id)) {
    return nameOf?.(id) ?? embedded ?? PROJECT_MEMBERS_MENTION_LABEL
  }
  if (id.startsWith(ATTR_MENTION_PREFIX)) {
    return nameOf?.(id) ?? embedded ?? UNKNOWN_ATTRIBUTE_NAME
  }
  return nameOf?.(id) ?? embedded ?? UNKNOWN_MENTION_NAME
}

/**
 * メンションを canonical 形式 `<@id>` に正規化する。
 * write 時に通すことで、hydrate で一時的に名前を埋め込んだ本文が再保存されても
 * 保存値は常に名前なしの canonical に固定される。
 */
export function canonicalizeMentions(content: string): string {
  return content.replace(mentionTokenRegExp(), (_full, id: string) => `<@${id}>`)
}

/**
 * read 時に `<@id>` を `<@id|現在の表示名>` へ解決する。
 * クライアント（Web の markdown-content / Mobile の parseMentions）は
 * この形式を `@表示名` として描画するため、名前変更が即座に反映される。
 */
export function hydrateMentions(content: string, nameOf: (id: string) => string | undefined): string {
  return content.replace(mentionTokenRegExp(), (_full, id: string, embedded?: string) => {
    const name = resolveMentionDisplayName(id, nameOf, embedded)
    return `<@${id}|${name}>`
  })
}

/**
 * メンションを表示用テキスト `@表示名` に変換する（通知本文・プレビュー用）。
 * nameOf があれば最新名で、なければ旧データの埋め込み名で解決する。
 */
export function stripMentionsToText(content: string, nameOf?: (id: string) => string | undefined): string {
  return content.replace(mentionTokenRegExp(), (_full, id: string, embedded?: string) => {
    return `@${resolveMentionDisplayName(id, nameOf, embedded)}`
  })
}
