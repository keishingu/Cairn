// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AiAttachmentError, createAiAttachmentUpload } from '@/lib/ai/attachments'
import { resolveUploadEntitlements } from '@/lib/billing/entitlements'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import { getAuthContext } from '@/lib/get-auth-context'

type RouteContext = { params: Promise<{ id: string }> }

const schema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(200),
  fileSize: z.number().int().positive(),
}).strict()

// AIアシスタントの会話への添付。メタデータだけを受け取り、署名付きアップロード URL を返す（本体はクライアントから Storage へ直接送る）
export async function POST(req: Request, { params }: RouteContext) {
  const { id: conversationId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'fileName・mimeType・fileSize を指定してください' }, { status: 400 })
  }

  // AI を使えるのは石を積んでいるメンバーだけ（送信と同じ条件。使えない人に Storage だけを使わせない）
  if (isBillingEnabled()) {
    const entitlements = await resolveUploadEntitlements(ctx.workspaceId, ctx.userId)
    if (!entitlements.isActiveSupporter) {
      return NextResponse.json(
        { error: 'AIへの依頼は、石を積んでいるメンバーのみ利用できます。設定の請求から石を積んでください。' },
        { status: 403 },
      )
    }
  }

  try {
    return NextResponse.json(await createAiAttachmentUpload(ctx, conversationId, parsed.data))
  } catch (err) {
    if (err instanceof AiAttachmentError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[POST /api/ai/conversations/[id]/attachments]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
