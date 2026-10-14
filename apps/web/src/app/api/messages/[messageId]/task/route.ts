// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { buildMentionNameMap } from '@/lib/chat/mention-name-map'
import { hasTaskChannelSchema, hasTaskSourceLineSchema } from '@/lib/tasks/schema-readiness'
import { taskCandidatesFromMessage, TASK_CANDIDATES_MAX } from '@/lib/tasks/task-candidates'
import { TASK_TITLE_MAX_LENGTH, taskTitleFromMessage } from '@/lib/tasks/title-from-message'

type RouteContext = { params: Promise<{ messageId: string }> }

export type MessageTaskDto = {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
}

export type MessageSourceTaskDto = MessageTaskDto & {
  /** タスク化した元の行（候補タイトル）。タスク名を変えても変わらない。旧チェックボックス由来は null */
  sourceLine: string | null
}

export type MessageTaskCandidateDto = {
  title: string
  isListItem: boolean
  /** この行（候補タイトル）から既に作成済みのタスク。タスク名を変えていても対応する。未作成なら null */
  taskId: string | null
}

export type MessageTaskCandidatesResponse = {
  candidates: MessageTaskCandidateDto[]
  tasks: MessageSourceTaskDto[]
}

export type MessageTaskCreateResponse = {
  tasks: MessageTaskDto[]
  createdCount: number
}

const taskTextSchema = z.string()
  .trim()
  .min(1)
  .refine(value => Array.from(value).length <= TASK_TITLE_MAX_LENGTH)

const createBodySchema = z.object({
  items: z
    .array(z.object({
      // GET が返した候補タイトルそのまま（作成済み判定のキー）
      line: taskTextSchema,
      // 利用者が編集したタスク名
      title: taskTextSchema,
    }))
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
  // source_line 列が無い間は INSERT / 作成済み判定ができない
  if (!(await hasTaskSourceLineSchema(db))) {
    return { error: NextResponse.json({ error: 'タスク化の準備中です' }, { status: 503 }) }
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
      sourceLine: tasks.sourceLine,
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

    // 一意制約の対象（チェックボックス由来ではないタスク）だけを、元の行（候補タイトル）で突き合わせる。
    // title は後から編集できるため判定に使わない。
    const taskIdByLine = new Map<string, string>()
    for (const task of existing) {
      if (task.sourceCheckboxIndex == null && task.sourceLine != null && !taskIdByLine.has(task.sourceLine)) {
        taskIdByLine.set(task.sourceLine, task.id)
      }
    }

    const body: MessageTaskCandidatesResponse = {
      candidates: candidates.map(candidate => ({
        title: candidate.title,
        isListItem: candidate.isListItem,
        taskId: taskIdByLine.get(candidate.title) ?? null,
      })),
      tasks: existing.map(({ id, title, status, sourceLine }) => ({ id, title, status, sourceLine })),
    }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[/api/messages/[messageId]/task GET] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// メッセージを出典とするタスクを items の数だけ作る。同じメッセージの同じ行（line）から作成済みなら作らずそれを返す。
// line は候補タイトルそのまま、title は利用者が編集したタスク名。
// body なし（空）の場合は後方互換として本文の最初の行1件（line = title）を作る。
export async function POST(req: Request, { params }: RouteContext) {
  const { messageId } = await params
  try {
    const loaded = await loadAuthorizedMessage(messageId, 'POST')
    if ('error' in loaded) return loaded.error
    const { ctx, message } = loaded

    const rawBody = await req.text()
    let items: { line: string; title: string }[]
    if (rawBody.trim() === '') {
      const nameMap = await buildMentionNameMap(ctx.workspaceId, [message.content])
      const title = taskTitleFromMessage(message.content, id => nameMap.get(id))
      if (!title) {
        return NextResponse.json({ error: '本文のないメッセージはタスクにできません' }, { status: 422 })
      }
      items = [{ line: title, title }]
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
          { error: `タスクは1〜${TASK_CANDIDATES_MAX}件、line・title とも各1〜${TASK_TITLE_MAX_LENGTH}文字で指定してください` },
          { status: 422 },
        )
      }
      // 現在の本文の候補にない line は受け付けない（本文が編集された後の古い要求や不正な line を弾く）
      const nameMap = await buildMentionNameMap(ctx.workspaceId, [message.content])
      const validLines = new Set(taskCandidatesFromMessage(message.content, id => nameMap.get(id)).map(c => c.title))
      if (parsed.data.items.some(item => !validLines.has(item.line))) {
        return NextResponse.json({ error: '本文にない行はタスクにできません。メッセージを開き直してください' }, { status: 422 })
      }
      // 同じ line は最初の1件だけ
      const seen = new Set<string>()
      items = parsed.data.items.filter(item => (seen.has(item.line) ? false : (seen.add(item.line), true)))
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
        .values(items.map(({ line, title }) => ({
          workspaceId: ctx.workspaceId,
          projectId: message.projectId,
          channelId: message.channelId,
          title,
          sourceLine: line,
          priority: 'medium' as const,
          status: 'todo' as const,
          createdBy: ctx.userId,
          sourceMessageId: messageId,
          assigneeId: null,
        })))
        // 同時リクエストや作成済みの行は一意制約で挿入されない（既存のタスクを返す）。
        // 対象列を指定しないのは、マイグレーション適用前に新コードが動いても ON CONFLICT が失敗しないため。
        .onConflictDoNothing()
        .returning({ id: tasks.id })
      return { deleted: false as const, createdCount: inserted.length }
    })
    if (insertResult.deleted) {
      return NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 })
    }

    // 要求した行に対応するタスクを（既存も含めて）要求順に返す
    const rows = await loadMessageTasks(ctx.workspaceId, messageId)
    const byLine = new Map<string, MessageTaskDto>()
    for (const row of rows) {
      if (row.sourceCheckboxIndex == null && row.sourceLine != null && !byLine.has(row.sourceLine)) {
        byLine.set(row.sourceLine, { id: row.id, title: row.title, status: row.status })
      }
    }
    const resultTasks = items.map(({ line }) => byLine.get(line))
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
