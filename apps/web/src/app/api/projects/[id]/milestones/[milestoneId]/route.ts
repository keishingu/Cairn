// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { patchMilestoneSchema, isMilestonePeriodReversed, MILESTONE_PERIOD_ERROR } from '@cairn/shared'
import { lockProjectUpdateChannel, postProjectUpdateMessage } from '@/lib/chat/post-project-update-message'
import { projectUpdateChange, type ProjectUpdateChange } from '@/lib/chat/project-update-message'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import type { MilestoneDto } from '../route'

type RouteContext = { params: Promise<{ id: string; milestoneId: string }> }

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id: projectId, milestoneId } = await params
  const { ctx, error } = await getAuthContext({ allowApiToken: true, requiredApiTokenScope: 'write' })
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchMilestoneSchema.safeParse(body)
  if (!parsed.success) {
    const error = parsed.error.issues.some(issue => issue.message === MILESTONE_PERIOD_ERROR) ? MILESTONE_PERIOD_ERROR : parsed.error.flatten()
    return NextResponse.json({ error }, { status: 422 })
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

    // 行をロックしてから「保存済みの値と合わせた検証 → 更新 → 通知」までを1つのトランザクションで行う。
    // 分けると、開始日だけ・終了日だけを直す更新が同時に来た時に、互いに古い値で検証を通って
    // 逆転した期間が保存される。通知も確定順と食い違い、古い値の通知が最後に残る
    const outcome = await db.transaction(async (tx) => {
      // ロックは「チャンネル → マイルストーン」の順に取る（チャットの投稿と同じ順。逆にするとデッドロックする）
      await lockProjectUpdateChannel(tx, projectId)
      const [previous] = await tx
        .select({
          startDate: milestones.startDate,
          endDate: milestones.endDate,
          startTime: milestones.startTime,
          endTime: milestones.endTime,
          completed: milestones.completed,
        })
        .from(milestones)
        .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)))
        // キーは変えないので NO KEY UPDATE で足りる（外部キー検査を待たせない）
        .for('no key update')
        .limit(1)
      if (!previous) return { kind: 'not_found' as const }

      // 片方だけ送られた場合も、保存済みのもう片方と合わせて判定する
      const datesInBody = ['startDate', 'endDate', 'startTime', 'endTime'].some(key => key in parsed.data)
      const nextStartDate = 'startDate' in parsed.data ? (parsed.data.startDate ?? null) : previous.startDate
      const nextEndDate = 'endDate' in parsed.data ? (parsed.data.endDate ?? null) : previous.endDate
      const nextStartTime = 'startTime' in parsed.data ? (parsed.data.startTime ?? null) : previous.startTime
      const nextEndTime = 'endTime' in parsed.data ? (parsed.data.endTime ?? null) : previous.endTime
      if (datesInBody && isMilestonePeriodReversed({ startDate: nextStartDate, endDate: nextEndDate, startTime: nextStartTime, endTime: nextEndTime })) {
        return { kind: 'date_order' as const }
      }

      const [row] = await tx
        .update(milestones)
        .set(set)
        .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)))
        .returning()
      if (!row) return { kind: 'not_found' as const }

      // 期日と完了はプロジェクト全体の予定に関わるため、プロジェクトチャンネルへ残す。
      // 値が変わらない保存では通知しない
      const changes: ProjectUpdateChange[] = []
      const periodChanged =
        row.startDate !== previous.startDate ||
        row.endDate !== previous.endDate ||
        row.startTime !== previous.startTime ||
        row.endTime !== previous.endTime
      if (periodChanged) changes.push(projectUpdateChange.milestoneDates(row))
      if (row.completed !== previous.completed) {
        changes.push(projectUpdateChange.milestoneCompleted(row, row.completed))
      }
      await postProjectUpdateMessage({ projectId, actorId: ctx.userId, changes, tx })

      return { kind: 'ok' as const, row }
    })

    if (outcome.kind === 'not_found') return new NextResponse(null, { status: 404 })
    if (outcome.kind === 'date_order') {
      return NextResponse.json({ error: MILESTONE_PERIOD_ERROR }, { status: 422 })
    }
    const updated = outcome.row

    const [channel] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.milestoneId, milestoneId))
      .limit(1)

    if (!channel) throw new Error('milestone channel not found')

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
