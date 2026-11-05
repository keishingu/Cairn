// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * 取り込んだ過去ログで名前が分からない投稿者の表示名。サーバーはこの日本語の文字列を返し（Expo アプリはそのまま出す）、
 * Web は表示言語の文言に置き換える。DB にもサーバーにも依存しないので、クライアントからも読み込める。
 */
export const IMPORTED_FALLBACK_NAMES = {
  anonymous: '投稿者不明',
  exporter: 'エクスポートした人',
  'unnamed-participant': '名前不明の参加者',
  named: '不明',
} as const

// Map にして、取り込み元の名前が `toString` などでも継承プロパティを翻訳キーとして拾わないようにする
const UI_KEYS = new Map<string, string>([
  [IMPORTED_FALLBACK_NAMES.anonymous, 'Unknown poster'],
  [IMPORTED_FALLBACK_NAMES.exporter, 'The person who exported'],
  [IMPORTED_FALLBACK_NAMES['unnamed-participant'], 'Participant without a name'],
])

/** 返信先・リアクションの人の名前が取り込みの代替名なら、表示言語の文言にする。それ以外はそのまま返す */
export function localizeImportedFallbackName(name: string, t: (key: string) => string): string {
  const key = UI_KEYS.get(name)
  return key ? t(key) : name
}
