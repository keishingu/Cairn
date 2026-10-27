// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * 画面に出すアプリ名。ファーストパーティ（投票など）は英語の名前を翻訳のキーとして持ち、表示言語で出す。
 * 外部アプリの名前は利用者が付けたデータなので、そのまま出す
 */
export function displayAppName(app: { name: string; firstParty?: boolean | undefined }, t: (message: string) => string): string {
  return app.firstParty ? t(app.name) : app.name
}
