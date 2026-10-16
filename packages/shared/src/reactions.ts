// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// リアクションの絵文字選択で Web とアプリが共有する規則。
// 絵文字データ（@emoji-mart/data）は各アプリが読み込み、ここへは引数で渡す（共有パッケージを重くしない）

export const DEFAULT_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙌', '👀']
const QUICK_REACTION_COUNT = 6
const HISTORY_LIMIT = 32

/** 保存済みの最近のリアクション。壊れた値は例外にし、呼び出し側でエラーを表示する */
export function parseReactionHistory(value: string | null): string[] {
  if (value === null) return []
  const parsed: unknown = JSON.parse(value)
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== 'string' || !item || item.length > 32)
  ) {
    throw new Error('Invalid reaction history')
  }
  return [...new Set(parsed as string[])].slice(0, HISTORY_LIMIT)
}

/** 最近使った順に並べ、足りない分を既定の絵文字で補う */
export function quickReactions(recent: readonly string[]): string[] {
  return [...new Set([...recent, ...DEFAULT_REACTIONS])].slice(0, QUICK_REACTION_COUNT)
}

/** 使った絵文字を先頭へ移した履歴 */
export function nextReactionHistory(recent: readonly string[], emoji: string): string[] {
  return [emoji, ...recent.filter((item) => item !== emoji)].slice(0, HISTORY_LIMIT)
}

export type ReactionEmojiCatalog = {
  categories: Array<{ id: string; emojis: string[] }>
  emojis: Record<string, { id: string; name: string; keywords: string[]; skins: Array<{ native: string }> } | undefined>
}

export type ReactionEmojiEntry = { id: string; name: string; native: string }

/** 検索語があれば全カテゴリから、なければ選択中のカテゴリから、肌の色を反映した絵文字を返す */
export function filterReactionEmojis(
  catalog: ReactionEmojiCatalog,
  search: string,
  category: string,
  tone: number,
): ReactionEmojiEntry[] {
  const query = search.trim().toLowerCase()
  const ids = query
    ? Object.keys(catalog.emojis)
    : (catalog.categories.find((item) => item.id === category)?.emojis ?? [])
  return ids.flatMap((id) => {
    const emoji = catalog.emojis[id]
    if (!emoji) return []
    const words = [emoji.id, emoji.name, ...emoji.keywords, ...emoji.skins.map((skin) => skin.native)]
    if (query && !words.join(' ').toLowerCase().includes(query)) return []
    const skin = emoji.skins[tone] ?? emoji.skins[0]
    return skin ? [{ id, name: emoji.name, native: skin.native }] : []
  })
}

/** カテゴリ ID と表示名（英語キー。各アプリで翻訳する） */
export const REACTION_EMOJI_CATEGORY_LABELS: Record<string, string> = {
  people: 'Smileys & people',
  nature: 'Animals & nature',
  foods: 'Food & drink',
  activity: 'Activities',
  places: 'Travel & places',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
}

export const SKIN_TONE_SAMPLES = ['👋', '👋🏻', '👋🏼', '👋🏽', '👋🏾', '👋🏿']

// リアクションシートの上下スワイプ。上へ払えば全絵文字を開き、下へ払えば開いた一覧をたたむ（たたんだ状態なら閉じる）
const SWIPE_DISTANCE = 40
const SWIPE_VELOCITY = 0.5

export type ReactionSheetSwipe = 'expand' | 'collapse' | 'close' | null

/** vy は px/ms */
export function reactionSheetSwipe(dy: number, vy: number, expanded: boolean): ReactionSheetSwipe {
  if (dy <= -SWIPE_DISTANCE || vy <= -SWIPE_VELOCITY) return expanded ? null : 'expand'
  if (dy >= SWIPE_DISTANCE || vy >= SWIPE_VELOCITY) return expanded ? 'collapse' : 'close'
  return null
}

/** タップを奪わないよう、縦に十分動いてから応答する */
export function isVerticalSheetDrag(dx: number, dy: number): boolean {
  return Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)
}
