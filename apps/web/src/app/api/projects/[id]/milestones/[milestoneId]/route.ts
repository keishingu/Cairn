// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { patchMilestoneSchema } from '@cairn/shared'
import { postProjectUpdateMessage } from '@/lib/chat/post-project-update-message'
import { projectUpdateChange } from '@/lib/chat/project-update-message'
import { DATE_ORDER_ERROR, isEndBeforeStart } from '@/lib/date-range'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import type { MilestoneDto } from '../route'

type RouteContext = { params: Promise<{ id: string; milestoneId: string }> }

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id: projectId, milestoneId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchMilestoneSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const { db, channels, milestones, projects } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) return new NextResponse(null, { status: 404 })

    const forbidden = requireRole(ctx.role, 'member')
    if (forbidden) return forbidden

    const [previous] = await db
      .select({
        startDate: milestones.startDate,
        endDate: milestones.endDate,
        startTime: milestones.startTime,
        endTime: milestones.endTime,
        completed: milestones.completed,
      })
      .from(milestones)
      .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)))
      .limit(1)

    if (!previous) return new NextResponse(null, { status: 404 })

    // 片方だけ送られた場合も、保存済みのもう片方と合わせて判定する
    const datesInBody = 'startDate' in parsed.data || 'endDate' in parsed.data
    const nextStartDate = 'startDate' in parsed.data ? (parsed.data.startDate ?? null) : previous.startDate
    const nextEndDate = 'endDate' in parsed.data ? (parsed.data.endDate ?? null) : previous.endDate
    if (datesInBody && isEndBeforeStart(nextStartDate, nextEndDate)) {
      return NextResponse.json({ error: DATE_ORDER_ERROR }, { status: 422 })
    }

    const set: {
      title?: string
      description?: string | null
      startDate?: string | null
      endDate?: string | null
      startTime?: string | null
      endTime?: string | null
      completed?: boolean
      updatedAt: Date
    } = { updatedAt: new Date() }

    if (parsed.data.title !== undefined) set.title = parsed.data.title
    if ('description' in parsed.data) set.description = parsed.data.description ?? null
    if ('startDate' in parsed.data) set.startDate = parsed.data.startDate ?? null
    if ('endDate' in parsed.data) set.endDate = parsed.data.endDate ?? null
    if ('startTime' in parsed.data) set.startTime = parsed.data.startTime ?? null
    if ('endTime' in parsed.data) set.endTime = parsed.data.endTime ?? null
    if (parsed.data.completed !== undefined) set.completed = parsed.data.completed

    const [updated] = await db
      .update(milestones)
      .set(set)
      .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)))
      .returning()

    if (!updated) return new NextResponse(null, { status: 404 })

    const [channel] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.milestoneId, milestoneId))
      .limit(1)

    if (!channel) throw new Error('milestone channel not found')

    // 期日と完了はプロジェクト全体の予定に関わるため、プロジェクトチャンネルへ残す。
    // 値が変わらない保存では通知しない
    const changes: string[] = []
    const periodChanged =
      updated.startDate !== previous.startDate ||
      updated.endDate !== previous.endDate ||
      updated.startTime !== previous.startTime ||
      updated.endTime !== previous.endTime
    if (periodChanged) changes.push(projectUpdateChange.milestoneDates(updated.title, updated))
    if (updated.completed !== previous.completed) {
      changes.push(projectUpdateChange.milestoneCompleted(updated.title, updated.completed))
    }
    await postProjectUpdateMessage({ projectId, actorId: ctx.userId, changes })

    return NextResponse.json({
      id: updated.id,
      projectId: updated.projectId,
      title: updated.title,
      description: updated.description,
      startDate: updated.startDate,
      endDate: updated.endDate,
      startTime: updated.startTime,
      endTime: updated.endTime,
      completed: updated.completed,
      channelId: channel.id,
    } satisfies MilestoneDto)
  } catch (err) {
    console.error('[/api/projects/[id]/milestones/[milestoneId] PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id: projectId, milestoneId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  try {
    const { db, milestones, projects } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) return new NextResponse(null, { status: 404 })

    const forbidden = requireRole(ctx.role, 'member')
    if (forbidden) return forbidden

    const [deleted] = await db
      .delete(milestones)
      .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)))
      .returning({ id: milestones.id })

    if (!deleted) return new NextResponse(null, { status: 404 })

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[/api/projects/[id]/milestones/[milestoneId] DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
