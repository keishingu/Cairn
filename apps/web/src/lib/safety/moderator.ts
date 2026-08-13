// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createServiceRoleClient } from '@/lib/supabase/service'

export async function isModerator(userId: string): Promise<boolean> {
  const allowed = new Set((process.env['CAIRN_MODERATOR_EMAILS'] ?? '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean))
  if (allowed.size === 0) return false
  const { data, error } = await createServiceRoleClient().auth.admin.getUserById(userId)
  return !error && !!data.user?.email && allowed.has(data.user.email.toLowerCase())
}
