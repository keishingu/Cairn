// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { AiAttachmentError, deleteUnsentAiAttachment } from '@/lib/ai/attachments'
import { getAuthContext } from '@/lib/get-auth-context'

type RouteContext = { params: Promise<{ id: string; attachmentId: string }> }

// 送信前の添付を外す（送信済みの添付は会話と一緒に残す）
export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id: conversationId, attachmentId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error
  try {
    await deleteUnsentAiAttachment(ctx, conversationId, attachmentId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    if (err instanceof AiAttachmentError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[DELETE /api/ai/conversations/[id]/attachments/[attachmentId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
