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
} as const
