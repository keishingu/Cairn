// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// Cookie を使わないサービスロールクライアント。Inngest などのバックグラウンドジョブ専用。
// API ルートでは createServiceClient()（server.ts）を使うこと。

import { createClient } from '@supabase/supabase-js'

export function createServiceRoleClient() {
  return createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  )
}
