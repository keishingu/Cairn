// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { buildMentionNameMap } from '@/lib/chat/mention-name-map'
import { hasTaskChannelSchema } from '@/lib/tasks/schema-readiness'
import { taskCandidatesFromMessage, TASK_CANDIDATES_MAX } from '@/lib/tasks/task-candidates'
import { TASK_TITLE_MAX_LENGTH, taskTitleFromMessage } from '@/lib/tasks/title-from-message'

type RouteContext = { params: Promise<{ messageId: string }> }

export type MessageTaskDto = {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
}

export type MessageTaskCandidateDto = {
  title: string
  isListItem: boolean
  /** 同じタイトルで既に作成済みのタスク。未作成なら null */
  taskId: string | null
}

export type MessageTaskCandidatesResponse = {
  candidates: MessageTaskCandidateDto[]
  tasks: MessageTaskDto[]
}

export type MessageTaskCreateResponse = {
  tasks: MessageTaskDto[]
  createdCount: number
}

const createBodySchema = z.object({
  titles: z
    .array(
      z.string()
        .trim()
        .min(1)
        .refine(title => Array.from(title).length <= TASK_TITLE_MAX_LENGTH),
    )
    .min(1)
    .max(TASK_CANDIDATES_MAX),
})

// 認可・メッセージ取得は GET / POST 共通。失敗時はそのままレスポンスとして返せる NextResponse を返す。
async function loadAuthorizedMessage(messageId: string, method: 'GET' | 'POST') {
  const { ctx, error: authError } = await getAuthContext(
    method === 'POST'
      ? { allowApiToken: true, requiredApiTokenScope: 'write' }
      : { allowApiToken: true },
  )
  if (authError) return { error: authError }

  const { db, messages, channels } = await import('@cairn/db')
  const { and, eq, isNull } = await import('drizzle-orm')

  const [message] = await db
    .select({
      id: messages.id,
      content: messages.content,
      messageType: messages.messageType,
      channelId: messages.channelId,
      projectId: channels.projectId,
    })
    .from(messages)
    .innerJoin(channels, eq(messages.channelId, channels.id))
    .where(and(
      eq(messages.id, messageId),
      eq(channels.workspaceId, ctx.workspaceId),
      isNull(messages.deletedAt),
    ))
    .limit(1)

  if (!message || message.messageType === 'system') {
    return { error: NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 }) }
  }

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, message.channelId, ctx.role)
  if (forbidden) return { error: forbidden }

  if (!(await hasTaskChannelSchema(db))) {
    return { error: NextResponse.json({ error: 'チャンネルタスクを準備中です' }, { status: 503 }) }
  }

  return { ctx, message }
}

// このメッセージを出典とするタスク（作成順）。
async function loadMessageTasks(workspaceId: string, messageId: string) {
  const { db, tasks } = await import('@cairn/db')
  const { and, eq, asc } = await import('drizzle-orm')
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      sourceCheckboxIndex: tasks.sourceCheckboxIndex,
    })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.sourceMessageId, messageId)))
    .orderBy(asc(tasks.createdAt), asc(tasks.id))
}

// タスク化の候補（本文の各行）と、既に作成済みのタスクを返す。
export async function GET(_req: Request, { params }: RouteContext) {
  const { messageId } = await params
  try {
    const loaded = await loadAuthorizedMessage(messageId, 'GET')
    if ('error' in loaded) return loaded.error
    const { ctx, message } = loaded

    const nameMap = await buildMentionNameMap(ctx.workspaceId, [message.content])
    const candidates = taskCandidatesFromMessage(message.content, id => nameMap.get(id))
    const existing = await loadMessageTasks(ctx.workspaceId, messageId)

    // 一意制約の対象（チェックボックス由来ではないタスク）だけをタイトルで突き合わせる
    const taskIdByTitle = new Map<string, string>()
    for (const task of existing) {
      if (task.sourceCheckboxIndex == null && !taskIdByTitle.has(task.title)) taskIdByTitle.set(task.title, task.id)
    }

    const body: MessageTaskCandidatesResponse = {
      candidates: candidates.map(candidate => ({
        title: candidate.title,
        isListItem: candidate.isListItem,
        taskId: taskIdByTitle.get(candidate.title) ?? null,
      })),
      tasks: existing.map(({ id, title, status }) => ({ id, title, status })),
    }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[/api/messages/[messageId]/task GET] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// メッセージを出典とするタスクを titles の数だけ作る。同じメッセージに同じタイトルのタスクが既にあれば作らずそれを返す。
// body なし（空）の場合は後方互換として本文の最初の行1件を作る。
export async function POST(req: Request, { params }: RouteContext) {
  const { messageId } = await params
  try {
    const loaded = await loadAuthorizedMessage(messageId, 'POST')
    if ('error' in loaded) return loaded.error
    const { ctx, message } = loaded

    const rawBody = await req.text()
    let titles: string[]
    if (rawBody.trim() === '') {
      const nameMap = await buildMentionNameMap(ctx.workspaceId, [message.content])
      const title = taskTitleFromMessage(message.content, id => nameMap.get(id))
      if (!title) {
        return NextResponse.json({ error: '本文のないメッセージはタスクにできません' }, { status: 422 })
      }
      titles = [title]
    } else {
      let json: unknown
      try {
        json = JSON.parse(rawBody)
      } catch {
        return NextResponse.json({ error: 'リクエストの形式が正しくありません' }, { status: 422 })
      }
      const parsed = createBodySchema.safeParse(json)
      if (!parsed.success) {
        return NextResponse.json(
          { error: `タスク名は1〜${TASK_CANDIDATES_MAX}件、各1〜${TASK_TITLE_MAX_LENGTH}文字で指定してください` },
          { status: 422 },
        )
      }
      titles = [...new Set(parsed.data.titles)]
    }

    const { db, messages, tasks } = await import('@cairn/db')
    const { and, eq, isNull } = await import('drizzle-orm')

    // メッセージ削除（論理削除 + 由来タスク削除を1トランザクションで行う）と直列化する。
    // 行ロック後に未削除を確かめてから挿入し、削除済みメッセージに紐付くタスクを残さない。
    const insertResult = await db.transaction(async (tx) => {
      const [alive] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
        .for('update')
      if (!alive) return { deleted: true as const }

      const inserted = await tx
        .insert(tasks)
        .values(titles.map(title => ({
          workspaceId: ctx.workspaceId,
          projectId: message.projectId,
          channelId: message.channelId,
          title,
          priority: 'medium' as const,
          status: 'todo' as const,
          createdBy: ctx.userId,
          sourceMessageId: messageId,
          assigneeId: null,
        })))
        // 同時リクエストや作成済みのタイトルは一意制約で挿入されない（既存のタスクを返す）。
        // 対象列を指定しないのは、マイグレーション適用前に新コードが動いても ON CONFLICT が失敗しないため。
        .onConflictDoNothing()
        .returning({ id: tasks.id })
      return { deleted: false as const, createdCount: inserted.length }
    })
    if (insertResult.deleted) {
      return NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 })
    }

    // 要求したタイトルに対応するタスクを（既存も含めて）要求順に返す
    const rows = await loadMessageTasks(ctx.workspaceId, messageId)
    const byTitle = new Map<string, MessageTaskDto>()
    for (const row of rows) {
      if (row.sourceCheckboxIndex == null && !byTitle.has(row.title)) {
        byTitle.set(row.title, { id: row.id, title: row.title, status: row.status })
      }
    }
    const resultTasks = titles.map(title => byTitle.get(title))
    // ロック解放後、ここで読み直すまでにメッセージが削除されると由来タスクも消えている
    if (resultTasks.some(task => task == null)) {
      return NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 })
    }

    const body: MessageTaskCreateResponse = { tasks: resultTasks as MessageTaskDto[], createdCount: insertResult.createdCount }
    return NextResponse.json(body, { status: insertResult.createdCount > 0 ? 201 : 200 })
  } catch (err) {
    console.error('[/api/messages/[messageId]/task POST] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
