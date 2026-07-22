// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * デプロイ単位で切り替える静的な機能フラグ。
 *
 * デプロイ環境ごとの値はビルド時に固定され、Web・API・モバイルへ同じ設定が反映される。
 */
export function enabledOutsideProduction(
  environment = process.env['NEXT_PUBLIC_CAIRN_DEPLOYMENT_ENV']
    ?? process.env['EXPO_PUBLIC_CAIRN_DEPLOYMENT_ENV']
    ?? process.env.NODE_ENV,
): boolean {
  return environment !== 'production'
}

export const FEATURE_FLAGS = {
  dm: enabledOutsideProduction(),
  aiPmo: enabledOutsideProduction(),
} as const
