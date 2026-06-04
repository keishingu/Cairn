// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'

// 認証不要: Expo アプリが起動時にサーバーとの互換性を確認するため
export interface VersionDto {
  server_version: string
  // このバージョン未満の Expo アプリはアップデートを促す
  min_supported_app_version: string
  // サーバーが有効にしている機能（アプリ側のグレースフルデグラデーション用）
  features: {
    native_chat: boolean
  }
}

export async function GET() {
  return NextResponse.json({
    server_version: process.env['APP_VERSION'] ?? '0.1.0',
    min_supported_app_version: process.env['MIN_APP_VERSION'] ?? '0.1.0',
    features: {
      native_chat: true,
    },
  } satisfies VersionDto)
}
