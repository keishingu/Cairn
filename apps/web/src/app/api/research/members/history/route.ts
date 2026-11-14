// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'
import { queryArray, queryBoolean, researchRoute } from '@/lib/ai/research-route'
import { getResearchMemberHistory } from '@/lib/ai/workspace-research-directory'

const schema = z
  .object({
    userId: queryArray(z.string().uuid()),
    attribute: queryArray(z.string().trim().min(1).max(20)),
    projectRole: queryArray(z.string().trim().min(1).max(50)),
    includeFiles: queryBoolean,
  })
  .transform(({ userId, attribute, projectRole, includeFiles }) => ({
    userIds: userId,
    attributeNames: attribute,
    projectRoleNames: projectRole,
    includeFiles,
  }))
  .refine((input) => input.userIds || input.attributeNames || input.projectRoleNames, {
    message: 'userId / attribute / projectRole のいずれかを指定してください',
  })

export async function GET(req: Request) {
  return researchRoute(req, schema, getResearchMemberHistory, 'GET /api/research/members/history')
}
