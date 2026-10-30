// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'
import { queryArray, queryBoolean, queryLimit, researchRoute } from '@/lib/ai/research-route'
import { listResearchMembers } from '@/lib/ai/workspace-research-directory'

const schema = z
  .object({
    query: z.string().trim().max(100).optional(),
    attribute: queryArray(z.string().trim().min(1).max(20)),
    includeInactive: queryBoolean,
    limit: queryLimit,
  })
  .transform(({ attribute, ...rest }) => ({ ...rest, attributeNames: attribute }))

export async function GET(req: Request) {
  return researchRoute(req, schema, listResearchMembers, 'GET /api/research/members')
}
