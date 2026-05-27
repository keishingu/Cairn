// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { StatusKey } from '@/components/app/data'
import type { ProjectDto } from '../route'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ success: true })
  }

  try {
    const { db, projects, files, channels, messages, messageAttachments } = await import('@cairn/db')
    const { eq, and, or } = await import('drizzle-orm')
    const { getAuthContext } = await import('@/lib/get-auth-context')
    const { inngest } = await import('@/lib/inngest/client')

    const { ctx, error } = await getAuthContext()
    if (error) return error

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // CASCADE 前にストレージパスを収集する
    // - files.projectId = projectId（直接紐付き）
    // - プロジェクトチャンネル経由でアップロードされたファイル（projectId が未設定の旧データ含む）
    const filePaths = await db
      .selectDistinct({ storagePath: files.storagePath })
      .from(files)
      .leftJoin(messageAttachments, eq(messageAttachments.fileId, files.id))
      .leftJoin(messages, eq(messages.id, messageAttachments.messageId))
      .leftJoin(channels, eq(channels.id, messages.channelId))
      .where(
        or(
          eq(files.projectId, projectId),
          eq(channels.projectId, projectId),
        ),
      )

    if (filePaths.length > 0) {
      await inngest.send({
        name: 'storage/objects.delete',
        data: {
          bucket: 'chat-attachments',
          paths: filePaths.map(f => f.storagePath),
        },
      })
    }

    await db
      .delete(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/projects/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { statusName, coverPhotoUrl } = body as { statusName?: StatusKey; coverPhotoUrl?: string | null }

  if (statusName === undefined && coverPhotoUrl === undefined) {
    return NextResponse.json({ error: 'statusName or coverPhotoUrl is required' }, { status: 422 })
  }

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({
      id,
      ...(statusName !== undefined && { statusName }),
      ...(coverPhotoUrl !== undefined && { coverPhotoUrl }),
    } satisfies Partial<ProjectDto>)
  }

  try {
    const { db } = await import('@cairn/db')
    const { projects, projectStatuses } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const { getAuthContext } = await import('@/lib/get-auth-context')

    const { ctx, error } = await getAuthContext()
    if (error) return error

    let statusId: string | undefined
    if (statusName !== undefined) {
      const [status] = await db
        .select({ id: projectStatuses.id })
        .from(projectStatuses)
        .where(
          and(
            eq(projectStatuses.workspaceId, ctx.workspaceId),
            eq(projectStatuses.name, statusName),
          ),
        )
      if (!status) {
        return NextResponse.json({ error: 'Status not found' }, { status: 404 })
      }
      statusId = status.id
    }

    const [updated] = await db
      .update(projects)
      .set({
        ...(statusId !== undefined && { statusId }),
        ...(coverPhotoUrl !== undefined && { coverPhotoUrl }),
      })
      .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
      .returning({ id: projects.id })

    if (!updated) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({
      id,
      ...(statusName !== undefined && { statusName }),
      ...(coverPhotoUrl !== undefined && { coverPhotoUrl }),
    } satisfies Partial<ProjectDto>)
  } catch (err) {
    console.error('[PATCH /api/projects/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
