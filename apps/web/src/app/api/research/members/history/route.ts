// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'
import { queryArray, queryBoolean, researchRoute } from '@/lib/ai/research-route'
import { getResearchMemberHistory } from '@/lib/ai/workspace-research-directory'

const schema = z
  .object({
    userId: queryArray(z.string().uuid()),
    includeFiles: queryBoolean,
  })
  .transform(({ userId, includeFiles }) => ({ userIds: userId ?? [], includeFiles }))
  .refine((input) => input.userIds.length > 0, { message: 'userId を1つ以上指定してください' })

export async function GET(req: Request) {
  return researchRoute(req, schema, getResearchMemberHistory, 'GET /api/research/members/history')
}
