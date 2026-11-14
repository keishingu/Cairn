// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { executePendingAction } from '@/lib/ai/pending-action-executor'
import { pendingActionRoute } from '@/lib/ai/pending-action-route'
import { approvePendingAction } from '@/lib/ai/pending-actions'

const bodySchema = z.object({ edits: z.record(z.unknown()).optional() }).strict()

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let edits: Record<string, unknown> | undefined
  try {
    const text = await req.text()
    const parsed = bodySchema.safeParse(text ? JSON.parse(text) : {})
    if (!parsed.success) return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 })
    edits = parsed.data.edits
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 })
  }
  return pendingActionRoute(
    params,
    (ctx, id) => approvePendingAction(ctx, id, edits, executePendingAction),
    'POST /api/ai/pending-actions/[id]/approve',
  )
}
