// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { AiChatModel } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { loadWorkspaceChatModels, resolveConversationModel } from '@/lib/ai/chat-model'
import { requireAiChatAccess } from '@/lib/ai/chat-access'

export interface ConversationDto {
  id: string
  title: string | null
  // この会話で使うモデル（旧い会話はワークスペースの既定モデル）
  model: AiChatModel
  createdAt: string
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  // /ai を使えるロールは owner が決める（設定の「AIエージェント」）
  const aiAccessDenied = await requireAiChatAccess(ctx)
  if (aiAccessDenied) return aiAccessDenied

  try {
    const { db, aiConversations } = await import('@cairn/db')
    const { and, eq, desc } = await import('drizzle-orm')

    const models = await loadWorkspaceChatModels(ctx.workspaceId)
    const rows = await db
      .select({
        id: aiConversations.id,
        title: aiConversations.title,
        model: aiConversations.model,
        createdAt: aiConversations.createdAt,
      })
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.workspaceId, ctx.workspaceId),
          eq(aiConversations.createdBy, ctx.userId),
        ),
      )
      .orderBy(desc(aiConversations.createdAt))

    return NextResponse.json(
      rows.map(r => ({
        id: r.id,
        title: r.title,
        model: resolveConversationModel(r.model, models),
        createdAt: r.createdAt.toISOString(),
      })) satisfies ConversationDto[],
    )
  } catch (err) {
    console.error('[GET /api/ai/conversations]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST() {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  // /ai を使えるロールは owner が決める（設定の「AIエージェント」）
  const aiAccessDenied = await requireAiChatAccess(ctx)
  if (aiAccessDenied) return aiAccessDenied

  try {
    const { db, aiConversations } = await import('@cairn/db')

    // 新しい会話はワークスペースの既定モデルで始める（会話の中で利用者が切り替えられる）
    const { defaultModel } = await loadWorkspaceChatModels(ctx.workspaceId)
    const [inserted] = await db
      .insert(aiConversations)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        model: defaultModel,
      })
      .returning({ id: aiConversations.id, title: aiConversations.title, createdAt: aiConversations.createdAt })

    if (!inserted) throw new Error('Insert returned no rows')

    return NextResponse.json(
      {
        id: inserted.id,
        title: inserted.title,
        model: defaultModel,
        createdAt: inserted.createdAt.toISOString(),
      } satisfies ConversationDto,
      { status: 201 },
    )
  } catch (err) {
    console.error('[POST /api/ai/conversations]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
