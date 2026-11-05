// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'
import { queryLimit, researchRoute } from '@/lib/ai/research-route'
import { readResearchChannelMessages } from '@/lib/ai/workspace-research-directory'

// チャンネル名で直接読む入口（MCP の read_channel_messages が名前指定のときに使う）。
// channelId / channelName のどちらか一方、の検証と名前解決は readResearchChannelMessages 側で行う
const schema = z.object({
  channelId: z.string().uuid().optional(),
  channelName: z.string().trim().min(1).max(100).optional(),
  since: z.string().datetime({ offset: true }).optional(),
  until: z.string().datetime({ offset: true }).optional(),
  cursor: z.string().max(100).optional(),
  limit: queryLimit,
})

export async function GET(req: Request) {
  return researchRoute(req, schema, readResearchChannelMessages, 'GET /api/research/channels/messages')
}
