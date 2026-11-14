// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { handlePollsRequest } from '@/first-party-apps/polls'

// 投票アプリの Request URL（apps.request_url にパスで登録される）。署名の検証から先は投票アプリが持つ
export async function POST(req: Request) {
  try {
    return await handlePollsRequest(req)
  } catch (err) {
    console.error('[/api/first-party-apps/polls/interactions] failed:', err)
    return new Response('internal error', { status: 500 })
  }
}
