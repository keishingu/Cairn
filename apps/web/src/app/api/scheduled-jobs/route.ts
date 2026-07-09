// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { ScheduledJobActionSpec, ScheduledJobMention, ScheduledJobMonthlySchedule } from '@cairn/db'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess, requireWorkspaceMember } from '@/lib/permissions'
import {
  compileScheduledJobInstruction,
  ScheduledJobCompileError,
} from '@/lib/scheduled-jobs/compile'
import { computeNextRunAt } from '@/lib/scheduled-jobs/schedule'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'

const createScheduledJobSchema = z.object({
  rawInstruction: z.string().trim().min(1).max(1000),
  enabled: z.boolean().optional(),
})

const updateScheduledJobSchema = z.object({
  id: z.string().uuid(),
  rawInstruction: z.string().trim().min(1).max(1000).optional(),
  enabled: z.boolean().optional(),
})

const deleteScheduledJobSchema = z.object({
  id: z.string().uuid(),
})

export interface ScheduledJobDto {
  id: string
  rawInstruction: string
  enabled: boolean
  timezone: string
  schedule: ScheduledJobMonthlySchedule
  actionSpec: ScheduledJobActionSpec
  mentionUserIds: string[]
  mentions: ScheduledJobMention[]
  channelId: string
  channelName: string
  nextRunAt: string | null
  lastCompilePreview: string
  createdAt: string
  updatedAt: string
}

async function listCompileCandidates(workspaceId: string, userId: string) {
  const { db, channels, profiles, projects, workspaceMembers } = await import('@cairn/db')
  const { eq, and, sql } = await import('drizzle-orm')

  const [channelRows, memberRows] = await Promise.all([
    db
      .select({ id: channels.id, name: channels.name })
      .from(channels)
      .leftJoin(projects, eq(channels.projectId, projects.id))
      .where(sql`coalesce(${channels.workspaceId}, ${projects.workspaceId}) = ${workspaceId}`),
    db
      .select({
        id: workspaceMembers.userId,
        displayName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
      })
      .from(workspaceMembers)
      .leftJoin(profiles, eq(workspaceMembers.userId, profiles.id))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.membershipStatus, 'active'))),
  ])

  const accessibleChannelRows = (
    await Promise.all(channelRows.map(async (row) => {
      if (typeof row.name !== 'string' || row.name.length === 0) return null
      const forbidden = await requireChannelAccess(workspaceId, userId, row.id)
      return forbidden ? null : row
    }))
  ).filter((row): row is { id: string, name: string } => row !== null)

  return {
    channelCandidates: accessibleChannelRows,
    memberCandidates: memberRows.map(row => ({
      id: row.id,
      displayName: row.displayName?.trim() || row.id,
    })),
  }
}

async function filterAccessibleJobs(
  workspaceId: string,
  userId: string,
  jobs: ScheduledJobDto[],
): Promise<ScheduledJobDto[]> {
  const accessResults = await Promise.all(
    jobs.map(job => requireChannelAccess(workspaceId, userId, job.channelId)),
  )
  return jobs.filter((_, index) => !accessResults[index])
}

async function serializeAccessibleJobs(workspaceId: string, userId: string): Promise<ScheduledJobDto[]> {
  const jobs = await serializeJobs(workspaceId)
  return filterAccessibleJobs(workspaceId, userId, jobs)
}

async function serializeJobs(workspaceId: string): Promise<ScheduledJobDto[]> {
  const { db, scheduledJobs, channels } = await import('@cairn/db')
  const { eq, desc } = await import('drizzle-orm')

  const rows = await db
    .select({
      id: scheduledJobs.id,
      rawInstruction: scheduledJobs.rawInstruction,
      enabled: scheduledJobs.enabled,
      timezone: scheduledJobs.timezone,
      schedule: scheduledJobs.schedule,
      actionSpec: scheduledJobs.actionSpec,
      mentionUserIds: scheduledJobs.mentionUserIds,
      mentions: scheduledJobs.mentions,
      channelId: scheduledJobs.channelId,
      channelName: channels.name,
      nextRunAt: scheduledJobs.nextRunAt,
      lastCompilePreview: scheduledJobs.lastCompilePreview,
      createdAt: scheduledJobs.createdAt,
      updatedAt: scheduledJobs.updatedAt,
    })
    .from(scheduledJobs)
    .innerJoin(channels, eq(scheduledJobs.channelId, channels.id))
    .where(eq(scheduledJobs.workspaceId, workspaceId))
    .orderBy(desc(scheduledJobs.updatedAt))

  return rows.map(row => ({
    id: row.id,
    rawInstruction: row.rawInstruction,
    enabled: row.enabled,
    timezone: row.timezone,
    schedule: row.schedule,
    actionSpec: row.actionSpec,
    mentionUserIds: row.mentionUserIds,
    mentions: row.mentions,
    channelId: row.channelId,
    channelName: row.channelName ?? '',
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastCompilePreview: row.lastCompilePreview,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = await requireWorkspaceMember(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden

  try {
    return NextResponse.json(await serializeAccessibleJobs(ctx.workspaceId, ctx.userId))
  } catch (err) {
    console.error('[/api/scheduled-jobs] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load scheduled jobs' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = await requireWorkspaceMember(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden

  let parsed
  try {
    parsed = createScheduledJobSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const compiled = await compileScheduledJobInstruction(
      parsed.rawInstruction,
      await listCompileCandidates(ctx.workspaceId, ctx.userId),
    )
    const channelForbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, compiled.channelId)
    if (channelForbidden) return channelForbidden

    const { db, scheduledJobs } = await import('@cairn/db')
    await db.insert(scheduledJobs).values({
      workspaceId: ctx.workspaceId,
      channelId: compiled.channelId,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
      enabled: parsed.enabled ?? true,
      rawInstruction: parsed.rawInstruction,
      timezone: 'Asia/Tokyo',
      schedule: compiled.schedule,
      mentionUserIds: compiled.mentionUserIds,
      mentions: compiled.mentions,
      actionSpec: compiled.actionSpec,
      nextRunAt: compiled.nextRunAt,
      lastCompiledAt: new Date(),
      lastCompilePreview: compiled.preview,
      updatedAt: new Date(),
    })

    return NextResponse.json(await serializeAccessibleJobs(ctx.workspaceId, ctx.userId), { status: 201 })
  } catch (err) {
    if (err instanceof ScheduledJobCompileError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    console.error('[/api/scheduled-jobs] POST failed:', err)
    return NextResponse.json({ error: 'Failed to create scheduled job' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = await requireWorkspaceMember(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden

  let parsed
  try {
    parsed = updateScheduledJobSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const { db, scheduledJobs } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const [existing] = await db
      .select()
      .from(scheduledJobs)
      .where(and(eq(scheduledJobs.id, parsed.id), eq(scheduledJobs.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!existing) {
      return NextResponse.json({ error: 'Scheduled job not found' }, { status: 404 })
    }

    const channelForbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, existing.channelId)
    if (channelForbidden) return channelForbidden

    if (parsed.rawInstruction) {
      const compiled = await compileScheduledJobInstruction(
        parsed.rawInstruction,
        await listCompileCandidates(ctx.workspaceId, ctx.userId),
      )
      const nextChannelForbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, compiled.channelId)
      if (nextChannelForbidden) return nextChannelForbidden

      const updatePayload: {
        channelId: string
        updatedBy: string
        rawInstruction: string
        schedule: typeof compiled.schedule
        mentionUserIds: typeof compiled.mentionUserIds
        mentions: typeof compiled.mentions
        actionSpec: typeof compiled.actionSpec
        nextRunAt: Date | null
        lastCompiledAt: Date
        lastCompilePreview: string
        updatedAt: Date
        enabled?: boolean
      } = {
        channelId: compiled.channelId,
        updatedBy: ctx.userId,
        rawInstruction: parsed.rawInstruction,
        schedule: compiled.schedule,
        mentionUserIds: compiled.mentionUserIds,
        mentions: compiled.mentions,
        actionSpec: compiled.actionSpec,
        nextRunAt: compiled.nextRunAt,
        lastCompiledAt: new Date(),
        lastCompilePreview: compiled.preview,
        updatedAt: new Date(),
      }

      if (typeof parsed.enabled === 'boolean') {
        updatePayload.enabled = parsed.enabled
      }

      await db
        .update(scheduledJobs)
        .set(updatePayload)
        .where(eq(scheduledJobs.id, parsed.id))
    } else if (typeof parsed.enabled === 'boolean') {
      const now = new Date()
      const nextRunAt = parsed.enabled
        ? (
            existing.nextRunAt instanceof Date && existing.nextRunAt.getTime() > now.getTime()
              ? existing.nextRunAt
              : computeNextRunAt(existing.schedule, now)
          )
        : existing.nextRunAt

      await db
        .update(scheduledJobs)
        .set({
          enabled: parsed.enabled,
          nextRunAt,
          updatedBy: ctx.userId,
          updatedAt: now,
        })
        .where(eq(scheduledJobs.id, parsed.id))
    }

    return NextResponse.json(await serializeAccessibleJobs(ctx.workspaceId, ctx.userId))
  } catch (err) {
    if (err instanceof ScheduledJobCompileError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    console.error('[/api/scheduled-jobs] PUT failed:', err)
    return NextResponse.json({ error: 'Failed to update scheduled job' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = await requireWorkspaceMember(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden

  let parsed
  try {
    parsed = deleteScheduledJobSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const { db, scheduledJobs } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const [existing] = await db
      .select({ channelId: scheduledJobs.channelId })
      .from(scheduledJobs)
      .where(and(eq(scheduledJobs.id, parsed.id), eq(scheduledJobs.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!existing) {
      return NextResponse.json({ error: 'Scheduled job not found' }, { status: 404 })
    }

    const channelForbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, existing.channelId)
    if (channelForbidden) return channelForbidden

    await db
      .delete(scheduledJobs)
      .where(and(eq(scheduledJobs.id, parsed.id), eq(scheduledJobs.workspaceId, ctx.workspaceId)))

    return NextResponse.json(await serializeAccessibleJobs(ctx.workspaceId, ctx.userId))
  } catch (err) {
    console.error('[/api/scheduled-jobs] DELETE failed:', err)
    return NextResponse.json({ error: 'Failed to delete scheduled job' }, { status: 500 })
  }
}
