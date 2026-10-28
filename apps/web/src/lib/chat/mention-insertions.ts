// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 入力欄でピッカーから入れた `@表示名` を、送信時にメンションの記法へ置き換える（チャットと AIアシスタントで共用）。
// 入力欄には読みやすい `@表示名` を見せ、どの人を選んだかは挿入の記録（tokenId と表示名）で持つ。

export interface MentionInsertion {
  tokenId: string
  displayName: string
}

function insertedMentionRegExp(displayName: string): RegExp {
  const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`@${escaped}(?=[\\s、。！？]|$)`)
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
