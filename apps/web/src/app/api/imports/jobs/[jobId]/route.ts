// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getImportJob } from '@/lib/imports/service'
import { withImportAdmin } from '@/lib/imports/route-helpers'

type RouteContext = { params: Promise<{ jobId: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { jobId } = await params
  return withImportAdmin('get job', async ({ workspaceId }) => NextResponse.json(await getImportJob(workspaceId, jobId)))
}
