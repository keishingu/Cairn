// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { importMessageBatch } from '@/lib/imports/service'
import { importBatchSchema } from '@/lib/imports/schema'
import { parseJsonBody, withImportAdmin } from '@/lib/imports/route-helpers'

type RouteContext = { params: Promise<{ jobId: string }> }

/** 1つの会話のメッセージを最大200件まとめて取り込む。同じバッチを何度送っても二重登録されない */
export async function POST(req: Request, { params }: RouteContext) {
  const { jobId } = await params
  return withImportAdmin('import batch', async ({ userId, workspaceId }) => {
    const { data, error } = await parseJsonBody(req, importBatchSchema)
    if (error) return error
    return NextResponse.json(await importMessageBatch(workspaceId, userId, jobId, data))
  })
}
