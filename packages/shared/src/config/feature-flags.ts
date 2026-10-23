// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * デプロイ単位で切り替える静的な機能フラグ。
 *
 * デプロイ環境ごとの値はビルド時に固定され、Web・API・モバイルへ同じ設定が反映される。
 */
export const FEATURE_FLAGS = {
  dm: true,
  aiPmo: true,
  /**
   * カードの markdown ブロックと meter 要素を受理する（docs/app-platform-design.md §4.4「描画を先に、受理を後に」）。
   * 描画は先に配信済み。ネイティブの OTA が行き渡ってから true にし、同時に BLOCKS_SCHEMA_VERSION を上げる
   */
  cardMarkdownAndMeter: false,
} as const
