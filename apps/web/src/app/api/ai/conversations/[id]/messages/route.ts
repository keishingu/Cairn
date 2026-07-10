// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createDataStreamResponse, streamText, type CoreMessage } from 'ai'
import { openai, DEFAULT_MODEL } from '@/lib/ai/client'
import { getAuthContext } from '@/lib/get-auth-context'
import { getGuestVisibleProjectIds, getWorkspaceMemberRole } from '@/lib/permissions'
import { webSearchTool } from '@/lib/ai/web-search'
import {
  MAX_HISTORY_MESSAGES,
  MAX_REQUEST_BODY_BYTES,
  buildModelMessages,
  normalizeStoredConversationMessages,
  parseLatestUserInput,
  type StoredConversationMessage,
} from './message-input'
import {
  AI_CHAT_RATE_LIMIT_WINDOW_MS,
  createAiChatRateLimitErrorMessage,
  isAiChatRateLimited,
} from './rate-limit'

type RouteContext = { params: Promise<{ id: string }> }

export interface MessageDto {
  id: string
  role: string
  content: string
  createdAt: string
  annotations?: unknown[]
  toolInvocations?: unknown[]
}

type StoredMessageRow = StoredConversationMessage & {
  id: string
  createdAt: Date | string
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { id: conversationId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

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
      .select({ id: aiMessages.id, role: aiMessages.role, content: aiMessages.content, annotations: aiMessages.annotations, toolInvocations: aiMessages.toolInvocations, createdAt: aiMessages.createdAt })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(asc(aiMessages.createdAt))

    const normalizedRows = normalizeStoredConversationMessages<StoredMessageRow>(
      rows.map(row => ({
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: row.createdAt,
        ...(row.annotations ? { annotations: row.annotations } : {}),
        ...(row.toolInvocations ? { toolInvocations: row.toolInvocations } : {}),
      })),
    )

    return NextResponse.json(
      normalizedRows.map(r => {
        const createdAt = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)

        return {
          id: r.id,
          role: r.role,
          content: r.content,
          createdAt: createdAt.toISOString(),
          ...(r.annotations ? { annotations: r.annotations } : {}),
          ...(r.toolInvocations ? { toolInvocations: r.toolInvocations } : {}),
        }
      }) satisfies MessageDto[],
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

  const rawBody = await req.text()
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BODY_BYTES) {
    return NextResponse.json(
      { error: `リクエスト本文は ${MAX_REQUEST_BODY_BYTES} bytes 以内で指定してください` },
      { status: 413 },
    )
  }

  let requestBody: unknown
  try {
    requestBody = JSON.parse(rawBody) as unknown
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  let lastUserContent: string
  let clientMessageCount: number
  try {
    const parsed = parseLatestUserInput(requestBody)
    lastUserContent = parsed.lastUserContent
    clientMessageCount = parsed.clientMessageCount
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid messages payload' },
      { status: 422 },
    )
  }

  let historyMessages: StoredConversationMessage[] = []
  {
    const { db, aiConversations, aiMessages } = await import('@cairn/db')
    const { eq, and, desc, count, gte } = await import('drizzle-orm')
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
      .orderBy(desc(aiMessages.createdAt), desc(aiMessages.id))
      .limit(MAX_HISTORY_MESSAGES)

    historyMessages = normalizeStoredConversationMessages<StoredMessageRow>(rows)

    const rateLimitWindowStart = new Date(Date.now() - AI_CHAT_RATE_LIMIT_WINDOW_MS)
    const [recentUsage] = await db
      .select({ count: count() })
      .from(aiMessages)
      .innerJoin(aiConversations, eq(aiMessages.conversationId, aiConversations.id))
      .where(and(
        eq(aiConversations.workspaceId, ctx.workspaceId),
        eq(aiConversations.createdBy, ctx.userId),
        eq(aiMessages.role, 'user'),
        gte(aiMessages.createdAt, rateLimitWindowStart),
      ))

    if (isAiChatRateLimited(recentUsage?.count ?? 0)) {
      return NextResponse.json(
        { error: createAiChatRateLimitErrorMessage() },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(AI_CHAT_RATE_LIMIT_WINDOW_MS / 1000)),
          },
        },
      )
    }
  }

  const messages = buildModelMessages(historyMessages, lastUserContent)

  const hasWebSearch = !!process.env['TAVILY_API_KEY']

  console.log('[AI chat] POST', {
    hasOpenAiKey: !!process.env['OPENAI_API_KEY'],
    hasTavilyKey: hasWebSearch,
    lastUserContent: lastUserContent.slice(0, 80),
    clientMessageCount,
    messageCount: messages.length,
  })

  // RAG: 最後のユーザーメッセージに関連するチャンクを検索
  type RagSource = { sourceType: string; sourceId: string; name: string; fileType?: string; externalUrl?: string }
  let contextSection = ''
  let ragSources: RagSource[] = []

  if (lastUserContent) {
    try {
      const { searchChunks } = await import('@/lib/ai/search-chunks')
      // ゲストは参加プロジェクトのチャンクのみ RAG 参照可。member 以上は制限なし。
      const role = await getWorkspaceMemberRole(ctx.workspaceId, ctx.userId)
      const allowedProjectIds = role === 'guest'
        ? await getGuestVisibleProjectIds(ctx.workspaceId, ctx.userId)
        : null
      const chunks = await searchChunks(lastUserContent, ctx.workspaceId, { limit: 5, minSimilarity: 0.5, allowedProjectIds })
      console.log(`[AI chat] RAG: query="${lastUserContent.slice(0, 50)}" chunks=${chunks.length}`, chunks.map(c => ({ type: c.sourceType, sim: c.similarity.toFixed(3), preview: c.content.slice(0, 60) })))
      if (chunks.length > 0) {
        contextSection = `\n\n【ワークスペースの参照情報】\n${chunks.map(c => c.content).join('\n\n---\n\n')}`

        // ソース名を解決（重複排除後）
        const seen = new Set<string>()
        const unique = chunks.filter(c => { const k = `${c.sourceType}:${c.sourceId}`; if (seen.has(k)) return false; seen.add(k); return true })
        try {
          const { db, files, projects, profiles } = await import('@cairn/db')
          const { inArray } = await import('drizzle-orm')
          const fileIds = unique.filter(c => c.sourceType === 'file').map(c => c.sourceId)
          const projectIds = unique.filter(c => c.sourceType === 'project').map(c => c.sourceId)
          const memberIds = unique.filter(c => c.sourceType === 'member').map(c => c.sourceId)
          const [fileRows, projectRows, memberRows] = await Promise.all([
            fileIds.length > 0 ? db.select({ id: files.id, fileName: files.fileName, fileType: files.fileType, metadata: files.metadata }).from(files).where(inArray(files.id, fileIds)) : [],
            projectIds.length > 0 ? db.select({ id: projects.id, title: projects.title }).from(projects).where(inArray(projects.id, projectIds)) : [],
            memberIds.length > 0 ? db.select({ id: profiles.id, displayName: profiles.displayName }).from(profiles).where(inArray(profiles.id, memberIds)) : [],
          ])
          const fileMap = new Map(fileRows.map(r => [r.id, r]))
          const projectMap = new Map(projectRows.map(r => [r.id, r.title]))
          const memberMap = new Map(memberRows.map(r => [r.id, r.displayName]))
          ragSources = unique.map(c => {
            if (c.sourceType === 'file') {
              const f = fileMap.get(c.sourceId)
              const meta = (f?.metadata ?? {}) as Record<string, unknown>
              return { sourceType: 'file', sourceId: c.sourceId, name: f?.fileName ?? c.sourceId, ...(f?.fileType !== undefined ? { fileType: f.fileType } : {}), ...(typeof meta['externalUrl'] === 'string' ? { externalUrl: meta['externalUrl'] } : {}) }
            }
            if (c.sourceType === 'project') {
              return { sourceType: 'project', sourceId: c.sourceId, name: projectMap.get(c.sourceId) ?? c.sourceId }
            }
            return { sourceType: 'member', sourceId: c.sourceId, name: memberMap.get(c.sourceId) ?? c.sourceId }
          })
        } catch (e) {
          console.warn('[AI chat] RAG source name lookup failed:', e)
        }
      }
    } catch (e) {
      console.warn('[AI chat] RAG search failed, proceeding without context:', e)
    }
  }

  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'full', timeStyle: 'short' })

  const systemPrompt = `あなたはワークスペースのAIアシスタントです。メンバーのプロジェクト管理・計画策定・情報整理を支援します。現在日時: ${now}。${contextSection}

回答は日本語で、簡潔かつ実用的にしてください。安全に関わる内容は専門家や現地の最新情報を確認するよう促してください。参照情報がある場合はそれを積極的に活用してください。${hasWebSearch ? '参照情報がない場合や最新情報が必要な場合は、webSearch ツールでウェブ検索してから回答してください。' : '参照情報がない場合は正直にその旨を伝えてください。'}`

  return createDataStreamResponse({
    execute: (dataStream) => {
      if (ragSources.length > 0) {
        dataStream.writeMessageAnnotation({ type: 'rag-sources', sources: ragSources })
      }
      const result = streamText({
        model: openai(DEFAULT_MODEL),
        system: systemPrompt,
        messages,
        ...(hasWebSearch ? { tools: { webSearch: webSearchTool }, maxSteps: 5 } : {}),
        onFinish: async ({ text, steps }) => {
          if (!lastUserContent) return
          try {
            const { db, aiMessages, aiConversations } = await import('@cairn/db')
            const { eq, and, isNull } = await import('drizzle-orm')
            const annotations: unknown[] = ragSources.length > 0 ? [{ type: 'rag-sources', sources: ragSources }] : []
            const toolInvocations: unknown[] = steps.flatMap(step =>
              step.toolResults.map(r => ({ state: 'result', toolCallId: r.toolCallId, toolName: r.toolName, args: r.args, result: r.result }))
            )
            await db.insert(aiMessages).values([
              { conversationId, role: 'user', content: lastUserContent },
              {
                conversationId, role: 'assistant', content: text,
                ...(annotations.length > 0 ? { annotations } : {}),
                ...(toolInvocations.length > 0 ? { toolInvocations } : {}),
              },
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
      result.mergeIntoDataStream(dataStream)
    },
    onError: (err) => err instanceof Error ? err.message : String(err),
  })
}
