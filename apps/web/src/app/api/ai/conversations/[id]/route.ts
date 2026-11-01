// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { patchAiConversationSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { loadWorkspaceChatModels } from '@/lib/ai/chat-model'
import { requireAiChatAccess } from '@/lib/ai/chat-access'
import type { ConversationDto } from '../route'

// 会話で使うモデルを切り替える。以降の依頼から反映され、送信済みのやり取りはそのまま残す。
// 選べるのはワークスペースの owner が許可したモデルだけ。会話は作成者本人だけが変えられる
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error
  // /ai を使えるロールは owner が決める（設定の「AIエージェント」）
  const aiAccessDenied = await requireAiChatAccess(ctx)
  if (aiAccessDenied) return aiAccessDenied

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = patchAiConversationSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  const { model } = parsed.data

  try {
    const { allowedModels } = await loadWorkspaceChatModels(ctx.workspaceId)
    if (!allowedModels.includes(model)) {
      return NextResponse.json({ error: 'このモデルはワークスペースで選べません' }, { status: 422 })
    }

    const { db, aiConversations } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')
    const [updated] = await db
      .update(aiConversations)
      .set({ model })
      .where(
        and(
          eq(aiConversations.id, conversationId),
          eq(aiConversations.workspaceId, ctx.workspaceId),
          eq(aiConversations.createdBy, ctx.userId),
        ),
      )
      .returning({ id: aiConversations.id, title: aiConversations.title, createdAt: aiConversations.createdAt })
    if (!updated) return NextResponse.json({ error: '会話が見つかりません' }, { status: 404 })

    return NextResponse.json({
      id: updated.id,
      title: updated.title,
      model,
      createdAt: updated.createdAt.toISOString(),
    } satisfies ConversationDto)
  } catch (err) {
    console.error('[PATCH /api/ai/conversations/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
