// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { lookupImportedMedia } from '@/lib/imports/service'
import { mediaLookupSchema } from '@/lib/imports/schema'
import { parseJsonBody, withImportAdmin } from '@/lib/imports/route-helpers'

type RouteContext = { params: Promise<{ jobId: string }> }

/** アップロード済みのメディアを返す。再実行のときに同じファイルを二重にアップロードしないために使う */
export async function POST(req: Request, { params }: RouteContext) {
  const { jobId } = await params
  return withImportAdmin('lookup media', async ({ workspaceId }) => {
    const { data, error } = await parseJsonBody(req, mediaLookupSchema)
    if (error) return error
    return NextResponse.json({ found: await lookupImportedMedia(workspaceId, jobId, data.objectIds) })
  })
}
