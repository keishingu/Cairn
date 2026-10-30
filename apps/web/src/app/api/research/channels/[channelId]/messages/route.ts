// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'
import { queryLimit, researchRoute } from '@/lib/ai/research-route'
import { readResearchChannelMessages } from '@/lib/ai/workspace-research-directory'

const schema = z.object({
  since: z.string().datetime({ offset: true }).optional(),
  until: z.string().datetime({ offset: true }).optional(),
  cursor: z.string().max(100).optional(),
  limit: queryLimit,
})

export async function GET(req: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params
  const parsedChannelId = z.string().uuid().safeParse(channelId)
  if (!parsedChannelId.success) {
    return Response.json({ error: 'チャンネルIDが不正です' }, { status: 422 })
  }
  return researchRoute(
    req,
    schema,
    (ctx, input) => readResearchChannelMessages(ctx, { ...input, channelId: parsedChannelId.data }),
    'GET /api/research/channels/[channelId]/messages',
  )
}
