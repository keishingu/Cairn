// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { publishConversationBatch } from '@/lib/imports/service'
import { publishBatchSchema } from '@/lib/imports/schema'
import { parseJsonBody, withImportAdmin } from '@/lib/imports/route-helpers'

type RouteContext = { params: Promise<{ jobId: string }> }

/** 一時保管した会話を、発言者を確定したうえでチャンネルに公開する（最大200件ずつ。続きは nextCursor で） */
export async function POST(req: Request, { params }: RouteContext) {
  const { jobId } = await params
  return withImportAdmin('publish batch', async ({ userId, workspaceId }) => {
    const { data, error } = await parseJsonBody(req, publishBatchSchema)
    if (error) return error
    return NextResponse.json(await publishConversationBatch(workspaceId, userId, jobId, data))
  })
}
