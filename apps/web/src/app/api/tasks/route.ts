// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createTaskSchema } from '@cairn/shared'
import { inngest } from '@/lib/inngest/client'
import type { TaskAssignedEvent } from '@/lib/inngest/events'

export interface TaskDto {
  id: string
  projectId: string
  projectTitle: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  priority: 'high' | 'medium' | 'low'
  dueDate: string | null
  assigneeName: string | null
  assigneeAvatarUrl: string | null
}

const MOCK_TASKS: TaskDto[] = [
  { id: 'tk1',  projectId: 'p1', projectTitle: '北アルプス縦走計画', title: '計画書を最新版に更新する',     status: 'todo',        priority: 'high',   dueDate: '2026-05-28', assigneeName: '山田 太郎', assigneeAvatarUrl: null },
  { id: 'tk2',  projectId: 'p1', projectTitle: '北アルプス縦走計画', title: '装備リストを確定する',         status: 'todo',        priority: 'medium', dueDate: '2026-05-25', assigneeName: '佐藤 花子', assigneeAvatarUrl: null },
  { id: 'tk3',  projectId: 'p1', projectTitle: '北アルプス縦走計画', title: 'テント場を予約する',           status: 'in_progress', priority: 'medium', dueDate: '2026-05-22', assigneeName: '鈴木 健', assigneeAvatarUrl: null },
  { id: 'tk4',  projectId: 'p1', projectTitle: '北アルプス縦走計画', title: '緊急連絡先を最新化する',       status: 'done',        priority: 'low',    dueDate: '2026-05-18', assigneeName: '田中 陽子', assigneeAvatarUrl: null },
  { id: 'tk5',  projectId: 'p2', projectTitle: '夏山合宿計画',       title: '宿泊施設を確認する',           status: 'todo',        priority: 'high',   dueDate: '2026-05-30', assigneeName: '田中 陽子', assigneeAvatarUrl: null },
  { id: 'tk6',  projectId: 'p2', projectTitle: '夏山合宿計画',       title: '参加者確認メールを送る',       status: 'done',        priority: 'low',    dueDate: '2026-05-15', assigneeName: '山田 太郎', assigneeAvatarUrl: null },
  { id: 'tk7',  projectId: 'p3', projectTitle: 'クライミング講習会', title: '講師との打ち合わせ',           status: 'in_progress', priority: 'high',   dueDate: '2026-05-21', assigneeName: '伊藤 翔', assigneeAvatarUrl: null },
  { id: 'tk8',  projectId: 'p3', projectTitle: 'クライミング講習会', title: '会場の予約確認',               status: 'todo',        priority: 'medium', dueDate: '2026-05-23', assigneeName: '高橋 美咲', assigneeAvatarUrl: null },
  { id: 'tk9',  projectId: 'p6', projectTitle: '春山合宿',           title: '反省会の議事録を作成',         status: 'todo',        priority: 'low',    dueDate: '2026-05-23', assigneeName: '高橋 美咲', assigneeAvatarUrl: null },
  { id: 'tk10', projectId: 'p4', projectTitle: '雪山訓練',           title: '必要装備リストの作成',         status: 'done',        priority: 'medium', dueDate: '2026-05-18', assigneeName: '中村 拓也', assigneeAvatarUrl: null },
  { id: 'tk11', projectId: 'p4', projectTitle: '雪山訓練',           title: 'ルート確認と地図の準備',       status: 'todo',        priority: 'medium', dueDate: '2026-05-27', assigneeName: '小林 大地', assigneeAvatarUrl: null },
  { id: 'tk12', projectId: 'p7', projectTitle: '沢登り練習会',       title: '安全講習の資料を作成する',     status: 'in_progress', priority: 'high',   dueDate: '2026-05-22', assigneeName: '鈴木 健', assigneeAvatarUrl: null },
]

const MOCK_PROJECT_TITLES: Record<string, string> = {
  p1: '北アルプス縦走計画',
  p2: '夏山合宿計画',
  p3: 'クライミング講習会',
  p4: '雪山訓練',
  p5: '秋山ハイキング',
  p6: '春山合宿',
  p7: '沢登り練習会',
  p8: '最終ハイキング',
}

function mockTasks(projectId?: string): TaskDto[] {
  return projectId ? MOCK_TASKS.filter(t => t.projectId === projectId) : MOCK_TASKS
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId') ?? undefined

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json(mockTasks(projectId))
  }

  try {
    const { ctx, error } = await getAuthContext()
    if (error) return error

    const { db } = await import('@cairn/db')
    const { tasks, projects, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, inArray, sql, and } = await import('drizzle-orm')

    const projectRows = await db
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(eq(projects.workspaceId, ctx.workspaceId))

    const projectIds = projectId
      ? [projectId]
      : projectRows.map(p => p.id)

    if (projectIds.length === 0) return NextResponse.json([])

    const taskRows = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        assigneeName: profiles.displayName,
        assigneeAvatarUrl: sql<string | null>`coalesce(${workspaceMembers.avatarUrl}, ${profiles.avatarUrl})`,
      })
      .from(tasks)
      .leftJoin(profiles, eq(tasks.assigneeId, profiles.id))
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, tasks.assigneeId), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
      .where(inArray(tasks.projectId, projectIds))

    const projectMap = new Map(projectRows.map(p => [p.id, p.title]))

    const result: TaskDto[] = taskRows.map(r => ({
      id: r.id,
      projectId: r.projectId,
      projectTitle: projectMap.get(r.projectId) ?? '',
      title: r.title,
      status: r.status,
      priority: r.priority,
      dueDate: r.dueDate,
      assigneeName: r.assigneeName ?? null,
      assigneeAvatarUrl: r.assigneeAvatarUrl ?? null,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/tasks] DB query failed:', err)
    return NextResponse.json(mockTasks(projectId))
  }
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // モックモードではプロジェクトIDが UUID でないため、先に分岐して UUID バリデーションを回避する
  if (!process.env['DATABASE_URL']) {
    const data = body as Record<string, unknown>
    const title = typeof data['title'] === 'string' ? data['title'].trim() : ''
    const projectId = typeof data['projectId'] === 'string' ? data['projectId'] : ''
    if (!title || !projectId) {
      return NextResponse.json({ error: 'title and projectId are required' }, { status: 422 })
    }
    const validPriorities: TaskDto['priority'][] = ['high', 'medium', 'low']
    const rawPriority = data['priority']
    const priority: TaskDto['priority'] = validPriorities.includes(rawPriority as TaskDto['priority'])
      ? (rawPriority as TaskDto['priority'])
      : 'medium'
    const rawDueDate = data['dueDate']
    const mock: TaskDto = {
      id: crypto.randomUUID(),
      projectId,
      projectTitle: MOCK_PROJECT_TITLES[projectId] ?? 'プロジェクト',
      title,
      status: 'todo',
      priority,
      dueDate: typeof rawDueDate === 'string' ? rawDueDate : null,
      assigneeName: null,
      assigneeAvatarUrl: null,
    }
    return NextResponse.json(mock, { status: 201 })
  }

  const parsed = createTaskSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const { ctx, error } = await getAuthContext()
    if (error) return error

    const { db } = await import('@cairn/db')
    const { tasks, projects, profiles, workspaceMembers } = await import('@cairn/db')
    const { eq, and, sql } = await import('drizzle-orm')

    const [inserted] = await db
      .insert(tasks)
      .values({
        projectId: parsed.data.projectId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        priority: parsed.data.priority,
        assigneeId: parsed.data.assigneeId ?? null,
        dueDate: parsed.data.dueDate ?? null,
        createdBy: ctx.userId,
      })
      .returning()

    if (!inserted) throw new Error('Insert returned no rows')

    const [projectRow] = await db
      .select({ title: projects.title })
      .from(projects)
      .where(eq(projects.id, inserted.projectId))

    const assigneeRow = inserted.assigneeId
      ? (await db
          .select({
            displayName: profiles.displayName,
            avatarUrl: sql<string | null>`coalesce(${workspaceMembers.avatarUrl}, ${profiles.avatarUrl})`,
          })
          .from(profiles)
          .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
          .where(eq(profiles.id, inserted.assigneeId)))[0]
      : null

    const result: TaskDto = {
      id: inserted.id,
      projectId: inserted.projectId,
      projectTitle: projectRow?.title ?? '',
      title: inserted.title,
      status: inserted.status,
      priority: inserted.priority,
      dueDate: inserted.dueDate,
      assigneeName: assigneeRow?.displayName ?? null,
      assigneeAvatarUrl: assigneeRow?.avatarUrl ?? null,
    }

    if (inserted.assigneeId && inserted.assigneeId !== ctx.userId) {
      const [assigner] = await db
        .select({ displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.id, ctx.userId))

      await inngest.send({
        name: 'task/assigned',
        data: {
          taskId: inserted.id,
          taskTitle: inserted.title,
          assigneeId: inserted.assigneeId,
          projectId: inserted.projectId,
          projectTitle: projectRow?.title ?? '',
          workspaceId: ctx.workspaceId,
          assignerName: assigner?.displayName ?? '不明',
        },
      } satisfies TaskAssignedEvent)
    }

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[POST /api/tasks] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
