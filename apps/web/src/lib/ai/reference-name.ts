// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

const REFERENCE_NAME_MAX_LENGTH = 60

/**
 * 指示文の参照（`<@id|名前>`・`<#id|名前>`）に埋め込む名前を、記法を壊せない形にする。
 * 表示名・チャンネル名はメンバーが自由に付けられるため、`<` `>` `|` や改行を含む名前で参照を閉じて
 * 指示文に文を書き足せないようにする。入力補完で入れるとき（クライアント）と、表示・実行で解決するとき（サーバー）の両方で使う
 */
export function sanitizeReferenceName(name: string): string {
  return name.replace(/[<>|\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, REFERENCE_NAME_MAX_LENGTH)
}
