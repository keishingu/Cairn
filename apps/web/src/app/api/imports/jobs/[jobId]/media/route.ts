// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { registerImportedMedia } from '@/lib/imports/service'
import { registerMediaSchema } from '@/lib/imports/schema'
import { parseJsonBody, withImportAdmin } from '@/lib/imports/route-helpers'

type RouteContext = { params: Promise<{ jobId: string }> }

/** 通常のアップロード経路で登録したファイルを、取り込み元のメディア ID に対応づける */
export async function POST(req: Request, { params }: RouteContext) {
  const { jobId } = await params
  return withImportAdmin('register media', async ({ userId, workspaceId }) => {
    const { data, error } = await parseJsonBody(req, registerMediaSchema)
    if (error) return error
    return NextResponse.json(await registerImportedMedia(workspaceId, userId, jobId, data))
  })
}
