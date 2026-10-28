// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 入力欄でピッカーから入れた `@表示名` を、送信時にメンションの記法へ置き換える（チャットと AIアシスタントで共用）。
// 入力欄には読みやすい `@表示名` を見せ、どの人を選んだかは挿入の記録（tokenId と表示名）で持つ。

export interface MentionInsertion {
  tokenId: string
  displayName: string
}

// `@表示名` の直後に来てよい文字。空白と句読点・閉じ括弧（和文・欧文）なら名前はそこで終わっている
const MENTION_BOUNDARY_SOURCE = '[\\s、。！？，．：；）」』】,.!?:;)\\]}]'
const MENTION_BOUNDARY_RE = new RegExp(`^${MENTION_BOUNDARY_SOURCE}`)

function insertedMentionRegExp(displayName: string): RegExp {
  const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`@${escaped}(?=${MENTION_BOUNDARY_SOURCE}|$)`)
}

/** ピッカーで入れた `@表示名` が本文に残っていれば、その位置を返す。送信時に記法へ変換するときと同じ区切りで判定する */
export function findInsertedMention(text: string, displayName: string): number | null {
  const match = insertedMentionRegExp(displayName).exec(text)
  return match ? match.index : null
}

/**
 * 本文に残っているメンションの tokenId。送信時の変換と同じく挿入順に `@表示名` を1件ずつ割り当てるので、
 * 同名の人・役割を2件入れて1件消すと、割り当てが残るのは先に入れた方だけになる
 */
export function survivingMentionTokenIds(text: string, insertions: ReadonlyArray<MentionInsertion>): Set<string> {
  const ids = new Set<string>()
  let rest = text
  for (const { tokenId, displayName } of insertions) {
    const index = findInsertedMention(rest, displayName)
    if (index === null) continue
    ids.add(tokenId)
    rest = rest.slice(0, index) + `<@${tokenId}>` + rest.slice(index + 1 + displayName.length)
  }
  return ids
}

/**
 * 本文の `@表示名` を、挿入順に先頭から1件ずつ記法へ置き換える（同名の2人を後勝ちで取り違えない）。
 * 記法は呼び出し側が決める（チャットは名前なしの `<@id>`、AIアシスタントは名前付きの `<@id|名前>`）
 */
export function encodeInsertedMentions(
  text: string,
  insertions: ReadonlyArray<MentionInsertion>,
  tokenFor: (insertion: MentionInsertion) => string,
): string {
  let result = text
  for (const insertion of insertions) {
    result = result.replace(insertedMentionRegExp(insertion.displayName), () => tokenFor(insertion))
  }
  return result
}

/** 入力欄に入れた位置を持つ挿入。同名の人を入れ替えても、位置で取り違えない */
export interface PositionedMentionInsertion extends MentionInsertion {
  /** `@` の位置 */
  start: number
}

function isIntactAt(text: string, insertion: PositionedMentionInsertion): boolean {
  const end = insertion.start + 1 + insertion.displayName.length
  return text.slice(insertion.start, end) === `@${insertion.displayName}`
    && (end === text.length || MENTION_BOUNDARY_RE.test(text.slice(end)))
}

/**
 * 入力欄の書き換えに合わせて挿入の位置をずらす。書き換えた範囲に重なった挿入（消した・名前を書き換えた）は外す。
 * 書き換えは前後の一致しない範囲1か所とみなす（打鍵・貼り付け・削除はどれもこの形になる）
 */
export function rebaseMentionInsertions(
  previous: string,
  next: string,
  insertions: ReadonlyArray<PositionedMentionInsertion>,
): PositionedMentionInsertion[] {
  if (previous === next) return [...insertions]
  let prefix = 0
  const maxPrefix = Math.min(previous.length, next.length)
  while (prefix < maxPrefix && previous[prefix] === next[prefix]) prefix += 1
  let suffix = 0
  const maxSuffix = Math.min(previous.length, next.length) - prefix
  while (suffix < maxSuffix && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix += 1
  const changedEnd = previous.length - suffix
  const delta = next.length - previous.length
  return insertions.flatMap(insertion => {
    const end = insertion.start + 1 + insertion.displayName.length
    // 名前の直後を書き換えたときは、名前が続いて別の文字列になっていないかを最後に確かめる
    const moved = end <= prefix ? insertion : insertion.start >= changedEnd ? { ...insertion, start: insertion.start + delta } : null
    return moved && isIntactAt(next, moved) ? [moved] : []
  })
}

/** 位置どおりに残っている挿入の tokenId（入れた人を候補から外す判定に使う） */
export function intactMentionTokenIds(text: string, insertions: ReadonlyArray<PositionedMentionInsertion>): Set<string> {
  return new Set(insertions.filter(insertion => isIntactAt(text, insertion)).map(insertion => insertion.tokenId))
}

/** 位置どおりに残っている `@表示名` を記法へ置き換える（後ろから置き換えて位置をずらさない） */
export function encodePositionedMentions(
  text: string,
  insertions: ReadonlyArray<PositionedMentionInsertion>,
  tokenFor: (insertion: MentionInsertion) => string,
): string {
  let result = text
  for (const insertion of [...insertions].filter(item => isIntactAt(text, item)).sort((a, b) => b.start - a.start)) {
    const end = insertion.start + 1 + insertion.displayName.length
    result = result.slice(0, insertion.start) + tokenFor(insertion) + result.slice(end)
  }
  return result
}

