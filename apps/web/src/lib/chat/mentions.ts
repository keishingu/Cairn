// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 構造化メンションの保存形式は canonical な `<@userId>`。
// 表示名（displayName）は本文に焼き込まず、read 時に最新のプロフィール名へ解決する。
// 旧データには `<@userId|displayName>` 形式が残っているため、両方を受理する。
const MENTION_TOKEN_SOURCE = '<@([^|>\\s]+)(?:\\|([^>\\n]+))?>'

export function mentionTokenRegExp(): RegExp {
  return new RegExp(MENTION_TOKEN_SOURCE, 'g')
}

// 名前解決できなかった（退会・削除された）ユーザー向けのフォールバック表示名
export const UNKNOWN_MENTION_NAME = '不明なメンバー'

/** 本文中の全メンションから userId を抽出する（重複排除） */
export function extractMentionIds(content: string): string[] {
  const ids = [...content.matchAll(mentionTokenRegExp())].map(m => m[1]!)
  return [...new Set(ids)]
}

/**
 * メンションを canonical 形式 `<@userId>` に正規化する。
 * write 時に通すことで、hydrate で一時的に名前を埋め込んだ本文が再保存されても
 * 保存値は常に名前なしの canonical に固定される。
 */
export function canonicalizeMentions(content: string): string {
  return content.replace(mentionTokenRegExp(), (_full, id: string) => `<@${id}>`)
}

/**
 * read 時に `<@userId>` を `<@userId|現在の表示名>` へ解決する。
 * クライアント（Web の markdown-content / Mobile の parseMentions）は
 * この形式を `@表示名` として描画するため、名前変更が即座に反映される。
 */
export function hydrateMentions(content: string, nameOf: (userId: string) => string | undefined): string {
  return content.replace(mentionTokenRegExp(), (_full, id: string, embedded?: string) => {
    const name = nameOf(id) ?? embedded ?? UNKNOWN_MENTION_NAME
    return `<@${id}|${name}>`
  })
}

/**
 * メンションを表示用テキスト `@表示名` に変換する（通知本文・プレビュー用）。
 * nameOf があれば最新名で、なければ旧データの埋め込み名で解決する。
 */
export function stripMentionsToText(content: string, nameOf?: (userId: string) => string | undefined): string {
  return content.replace(mentionTokenRegExp(), (_full, id: string, embedded?: string) => {
    const name = nameOf?.(id) ?? embedded ?? UNKNOWN_MENTION_NAME
    return `@${name}`
  })
}
