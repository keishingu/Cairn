// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'

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

  type PatchBody = {
    title?: string
    description?: string | null
    startDate?: string | null
    endDate?: string | null
    statusName?: string
    archived?: boolean
  }
  const b = body as PatchBody
  const keys = Object.keys(b as object)
  if (keys.length === 0) {
    return NextResponse.json({ error: 'At least one field is required' }, { status: 422 })
  }

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ id, ...b })
  }

  try {
    const { db } = await import('@cairn/db')
    const { projects, projectStatuses } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const { getAuthContext } = await import('@/lib/get-auth-context')

    const { ctx, error } = await getAuthContext()
    if (error) return error

    const set: {
      title?: string
      description?: string | null
      startDate?: string | null
      endDate?: string | null
      statusId?: string | null
      archived?: boolean
      updatedAt: Date
    } = { updatedAt: new Date() }

    if (b.title !== undefined) set.title = b.title
    if ('description' in (b as object)) set.description = b.description ?? null
    if ('startDate' in (b as object)) set.startDate = b.startDate ?? null
    if ('endDate' in (b as object)) set.endDate = b.endDate ?? null
    if (b.archived !== undefined) set.archived = b.archived

    if (b.statusName !== undefined) {
      const [status] = await db
        .select({ id: projectStatuses.id })
        .from(projectStatuses)
        .where(
          and(
            eq(projectStatuses.workspaceId, ctx.workspaceId),
            eq(projectStatuses.name, b.statusName),
          ),
        )
      if (!status) {
        return NextResponse.json({ error: 'Status not found' }, { status: 404 })
      }
      set.statusId = status.id
    }

    const [updated] = await db
      .update(projects)
      .set(set)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
      .returning({ id: projects.id })

    if (!updated) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({ id, ...b })
  } catch (err) {
    console.error('[PATCH /api/projects/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
