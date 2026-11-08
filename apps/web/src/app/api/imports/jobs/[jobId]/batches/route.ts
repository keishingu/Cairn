// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { stageMessageBatch } from '@/lib/imports/service'
import { importBatchSchema } from '@/lib/imports/schema'
import { parseJsonBody, withImportAdmin } from '@/lib/imports/route-helpers'

type RouteContext = { params: Promise<{ jobId: string }> }

/** 1つの会話のメッセージを最大200件まとめて一時保管する（チャンネルにはまだ出ない）。同じバッチを何度送っても二重登録されない */
export async function POST(req: Request, { params }: RouteContext) {
  const { jobId } = await params
  return withImportAdmin('stage batch', async ({ userId, workspaceId }) => {
    const { data, error } = await parseJsonBody(req, importBatchSchema)
    if (error) return error
    return NextResponse.json(await stageMessageBatch(workspaceId, userId, jobId, data))
  })
}
