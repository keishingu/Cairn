// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// Cookie を使わないサービスロールクライアント。Inngest などのバックグラウンドジョブ専用。
// API ルートでは createServiceClient()（server.ts）を使うこと。

import { createClient } from '@supabase/supabase-js'

export function createServiceRoleClient() {
  // SUPABASE_URL はサーバー専用（Inngest など NEXT_PUBLIC_ が使えないコンテキスト向け）
  // NEXT_PUBLIC_SUPABASE_URL はフォールバック（ローカル開発・Vercel Preview）
  const url = process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL']
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!url) throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(url, key)
}
