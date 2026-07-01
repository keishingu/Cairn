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

// userId -> email の解決。Supabase Auth admin API には一括取得 API が無いため、
// ユーザーごとに並列で getUserById を呼ぶ（プロジェクト/ワークスペースのメンバー一覧表示で共用）。
export async function resolveEmailsByUserId(
  admin: ReturnType<typeof createServiceRoleClient>,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const emails = new Map<string, string | null>()
  const uniqueUserIds = [...new Set(userIds)]
  const entries = await Promise.all(uniqueUserIds.map(async userId => {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error) {
      console.error('[resolveEmailsByUserId] Failed to resolve email:', userId, error)
      return [userId, null] as const
    }
    return [userId, data.user?.email ?? null] as const
  }))

  for (const [userId, email] of entries) {
    emails.set(userId, email)
  }

  return emails
}
