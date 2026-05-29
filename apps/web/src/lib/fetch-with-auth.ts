// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createClient } from '@/lib/supabase/client'

export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const reqHeaders = new Headers(init?.headers)
  if (session?.access_token) {
    reqHeaders.set('Authorization', `Bearer ${session.access_token}`)
  }

  return fetch(input, { ...init, headers: reqHeaders })
}
