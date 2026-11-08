// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { completeImportJob } from '@/lib/imports/service'
import { completeImportJobSchema } from '@/lib/imports/schema'
import { parseJsonBody, withImportAdmin } from '@/lib/imports/route-helpers'

type RouteContext = { params: Promise<{ jobId: string }> }

/** ジョブを終え、取り込まれなかった情報のレポート（件数と理由だけ）を保存する */
export async function POST(req: Request, { params }: RouteContext) {
  const { jobId } = await params
  return withImportAdmin('complete job', async ({ workspaceId }) => {
    const { data, error } = await parseJsonBody(req, completeImportJobSchema)
    if (error) return error
    return NextResponse.json(await completeImportJob(workspaceId, jobId, data))
  })
}
