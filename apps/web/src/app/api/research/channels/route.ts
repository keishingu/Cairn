// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'
import { queryBoolean, queryLimit, researchRoute } from '@/lib/ai/research-route'
import { listResearchChannels } from '@/lib/ai/workspace-research-directory'

const schema = z.object({
  query: z.string().trim().max(100).optional(),
  projectId: z.string().uuid().optional(),
  includeArchived: queryBoolean,
  limit: queryLimit,
})

export async function GET(req: Request) {
  return researchRoute(req, schema, listResearchChannels, 'GET /api/research/channels')
}
