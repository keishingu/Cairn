// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { streamText, type CoreMessage } from 'ai'
import { openai, DEFAULT_MODEL } from '@/lib/ai/client'
import { getAuthContext } from '@/lib/get-auth-context'

type RouteContext = { params: Promise<{ id: string }> }

export interface MessageDto {
  id: string
  role: string
  content: string
  createdAt: string
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { id: conversationId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json([] satisfies MessageDto[])
  }

  try {
    const { db, aiMessages, aiConversations } = await import('@cairn/db')
    const { eq, and, asc } = await import('drizzle-orm')

    // ワークスペースの所有であることを確認
    const [conv] = await db
      .select({ id: aiConversations.id })
      .from(aiConversations)
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!conv) return new NextResponse(null, { status: 404 })

    const rows = await db
      .select({ id: aiMessages.id, role: aiMessages.role, content: aiMessages.content, createdAt: aiMessages.createdAt })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(asc(aiMessages.createdAt))

    return NextResponse.json(
      rows.map(r => ({
        id: r.id,
        role: r.role,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
      })) satisfies MessageDto[],
    )
  } catch (err) {
    console.error('[GET /api/ai/conversations/[id]/messages]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  const { id: conversationId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['OPENAI_API_KEY']) {
    return NextResponse.json({ error: 'OPENAI_API_KEY が設定されていません' }, { status: 503 })
  }

  const body = await req.json() as { messages: CoreMessage[] }
  const { messages } = body

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
  const lastUserContent = typeof lastUserMessage?.content === 'string'
    ? lastUserMessage.content
    : ''

  // RAG: 最後のユーザーメッセージに関連するチャンクを検索
  let contextSection = ''
  if (process.env['DATABASE_URL'] && lastUserContent) {
    try {
      const { searchChunks } = await import('@/lib/ai/search-chunks')
      const chunks = await searchChunks(lastUserContent, ctx.workspaceId, { limit: 5, minSimilarity: 0.45 })
      if (chunks.length > 0) {
        contextSection = `\n\n【ワークスペースの参照情報】\n${chunks.map(c => c.content).join('\n\n---\n\n')}`
      }
    } catch (e) {
      console.warn('[AI chat] RAG search failed, proceeding without context:', e)
    }
  }

  const systemPrompt = `あなたはワークスペースのAIアシスタントです。メンバーのプロジェクト管理・計画策定・情報整理を支援します。${contextSection}

回答は日本語で、簡潔かつ実用的にしてください。安全に関わる内容は専門家や現地の最新情報を確認するよう促してください。参照情報がある場合はそれを積極的に活用し、ない場合は正直にその旨を伝えてください。`

  const result = streamText({
    model: openai(DEFAULT_MODEL),
    system: systemPrompt,
    messages,
    onFinish: async ({ text }) => {
      if (!process.env['DATABASE_URL'] || !lastUserContent) return
      try {
        const { db, aiMessages, aiConversations } = await import('@cairn/db')
        const { eq, and, isNull } = await import('drizzle-orm')

        await db.insert(aiMessages).values([
          { conversationId, role: 'user', content: lastUserContent },
          { conversationId, role: 'assistant', content: text },
        ])

        // 初回メッセージでタイトルを設定
        await db
          .update(aiConversations)
          .set({ title: lastUserContent.slice(0, 40) })
          .where(and(eq(aiConversations.id, conversationId), isNull(aiConversations.title)))
      } catch (e) {
        console.error('[AI chat] onFinish DB save failed:', e)
      }
    },
  })

  return result.toDataStreamResponse()
}
