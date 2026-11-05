// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/** Teams のリアクション名 → Unicode 絵文字。対応表に無いものは名前を残す（推測で別の絵文字にしない） */
const TEAMS_REACTION_EMOJI: Record<string, string> = {
  like: '👍',
  heart: '❤️',
  laugh: '😆',
  surprised: '😮',
  sad: '😢',
  angry: '😠',
  bow: '🙇',
  man_gesturing_ok: '🙆‍♂️',
  woman_gesturing_ok: '🙆‍♀️',
  handsinair: '🙌',
  star: '⭐',
  hearteyes: '😍',
  loudlycrying: '😭',
  headshakingvertically2: '🙂‍↕️',
  praying: '🙏',
  grinningfacewithsmilingeyes: '😄',
  faceholdingbacktears: '🥹',
  clap: '👏',
  fire: '🔥',
  party: '🎉',
  smile: '😊',
  wink: '😉',
  cool: '😎',
  thinking: '🤔',
  yes: '👍',
  no: '👎',
  ok: '👌',
  muscle: '💪',
  sweat: '😅',
  stareyes: '🤩',
  bowing: '🙇',
  rock: '🤘',
  victory: '✌️',
  expressionless: '😑',
  thewave: '👋',
  wave: '👋',
  thanks: '🙏',
  shivering: '🥶',
  sun: '☀️',
  mmm: '😋',
  think: '🤔',
  salute: '🫡',
  watermelon: '🍉',
  clappinghands: '👏',
  statueofliberty: '🗽',
  screamingfear: '😱',
  cwl: '😂',
  speechless: '😶',
  sweatgrinning: '😅',
}

/**
 * Teams のリアクション名を Cairn の絵文字に変換する。
 * `2705_whiteheavycheckmark` のように先頭が16進のコードポイントなら、それを使う。
 */
export function teamsReactionToEmoji(key: string): string {
  // `thewave3` のように末尾の数字だけが違う別バージョンがある
  const mapped = TEAMS_REACTION_EMOJI[key] ?? TEAMS_REACTION_EMOJI[key.replace(/\d+$/, '')]
  if (mapped) return mapped
  const codepoints = /^([0-9a-f]{4,6}(?:-[0-9a-f]{4,6})*)_/i.exec(key)
  if (codepoints) {
    try {
      return String.fromCodePoint(...codepoints[1]!.split('-').map(cp => parseInt(cp, 16)))
    } catch {
      // 不正なコードポイントは名前で残す
    }
  }
  return `:${key.slice(0, 40)}:`
}
