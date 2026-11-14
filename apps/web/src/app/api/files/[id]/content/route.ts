// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { readFileContent } from '@/lib/files/read-file-content'

const querySchema = z.object({
  startChunk: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(10).default(5),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext({
    allowApiToken: true,
    requiredApiTokenScope: 'read',
  })
  if (error) return error

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'startChunk または limit が不正です' }, { status: 422 })
  }

  const { id: fileId } = await params
  const { startChunk, limit } = parsed.data

  try {
    const outcome = await readFileContent(ctx, { fileId, startChunk, limit })
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    }
    const { file, chunks, nextStartChunk } = outcome.value
    return NextResponse.json({
      file: {
        id: file.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileType: file.fileType,
      },
      chunks,
      nextStartChunk,
    })
  } catch (err) {
    console.error('[GET /api/files/[id]/content]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
