// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'
import { researchRoute } from '@/lib/ai/research-route'
import { getResearchProjectMembers } from '@/lib/ai/workspace-research-directory'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsedProjectId = z.string().uuid().safeParse(id)
  if (!parsedProjectId.success) {
    return Response.json({ error: 'プロジェクトIDが不正です' }, { status: 422 })
  }
  return researchRoute(
    req,
    z.object({}),
    (ctx) => getResearchProjectMembers(ctx, { projectId: parsedProjectId.data }),
    'GET /api/research/projects/[id]/members',
  )
}
