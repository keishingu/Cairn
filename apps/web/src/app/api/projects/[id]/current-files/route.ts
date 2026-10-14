// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { canAccessFile, requireRole } from '@/lib/permissions'
import { z } from 'zod'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  const { id: projectId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }
  const payload = body as { fileId?: unknown; replaceFileId?: unknown; note?: unknown }
  const uuidSchema = z.string().uuid()
  if (typeof payload.fileId !== 'string' || !uuidSchema.safeParse(payload.fileId).success) {
    return NextResponse.json({ error: 'fileId を指定してください' }, { status: 400 })
  }
  const hasReplaceFileId = Object.prototype.hasOwnProperty.call(payload, 'replaceFileId')
  if (hasReplaceFileId && (typeof payload.replaceFileId !== 'string' || !uuidSchema.safeParse(payload.replaceFileId).success)) {
    return NextResponse.json({ error: 'replaceFileId は UUID で指定してください' }, { status: 400 })
  }
  const replaceFileId = hasReplaceFileId ? payload.replaceFileId as string : null
  if (payload.note !== undefined && typeof payload.note !== 'string') {
    return NextResponse.json({ error: '変更メモは文字列で指定してください' }, { status: 400 })
  }
  const note = typeof payload.note === 'string' ? payload.note.trim() : ''
  if (note.length > 2000) {
    return NextResponse.json({ error: '変更メモは2000文字以内で入力してください' }, { status: 400 })
  }
  if (replaceFileId && (!note || note.length > 2000)) {
    return NextResponse.json({ error: '差し替えメモを1〜2000文字で入力してください' }, { status: 400 })
  }
  if (replaceFileId === payload.fileId) {
    return NextResponse.json({ error: '差し替え元と同じファイルは選べません' }, { status: 400 })
  }

  try {
    const { db, files, projects, galleryItems } = await import('@cairn/db')
    const { and, eq, inArray, isNull, sql } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id, archived: projects.archived })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)
    if (!project) return new NextResponse(null, { status: 404 })

    const forbidden = requireRole(ctx.role, project.archived ? 'admin' : 'member')
    if (forbidden) return forbidden

    const ids = replaceFileId ? [payload.fileId, replaceFileId] : [payload.fileId]
    const rows = await db
      .select({
        id: files.id,
        workspaceId: files.workspaceId,
        projectId: files.projectId,
        uploadedBy: files.uploadedBy,
        metadata: files.metadata,
      })
      .from(files)
      .leftJoin(galleryItems, eq(galleryItems.fileId, files.id))
      .where(and(
        inArray(files.id, ids),
        eq(files.workspaceId, ctx.workspaceId),
        eq(files.projectId, projectId),
        isNull(galleryItems.id),
      ))
    if (rows.length !== ids.length) return new NextResponse(null, { status: 404 })
    for (const file of rows) {
      if (!(await canAccessFile(ctx.workspaceId, ctx.userId, file, ctx.role))) {
        return new NextResponse(null, { status: 403 })
      }
    }

    const file = rows.find(row => row.id === payload.fileId)!
    const replacedFile = replaceFileId ? rows.find(row => row.id === replaceFileId)! : null
    let lockedForbidden: Response | null = null
    const outcome = await db.transaction(async (tx) => {
      // 同一プロジェクトの確定資料変更を直列化し、置換の片側だけが残る状態を防ぐ。
      const [lockedProject] = await tx.select({ id: projects.id, archived: projects.archived }).from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
        .for('update').limit(1)
      if (!lockedProject) return 'missing' as const
      lockedForbidden = requireRole(ctx.role, lockedProject.archived ? 'admin' : 'member')
      if (lockedForbidden) return 'forbidden' as const

      const lockedFiles = await tx.select({ id: files.id, metadata: files.metadata })
        .from(files)
        .where(and(
          inArray(files.id, ids),
          eq(files.projectId, projectId),
          eq(files.workspaceId, ctx.workspaceId),
        ))
        .for('update')
      const lockedTarget = lockedFiles.find(row => row.id === file.id)
      const lockedSource = replacedFile ? lockedFiles.find(row => row.id === replacedFile.id) : null
      if (!lockedTarget || (replacedFile && !lockedSource)) return 'missing' as const
      const targetMeta = (lockedTarget.metadata ?? {}) as Record<string, unknown>
      if (targetMeta['isLatest'] === true) return 'already_current' as const

      if (replacedFile) {
        const sourceMeta = (lockedSource!.metadata ?? {}) as Record<string, unknown>
        if (sourceMeta['isLatest'] !== true) return 'stale' as const
        const notes = Array.isArray(sourceMeta['latestChangeNotes']) ? sourceMeta['latestChangeNotes'] : []
        const change = {
          note,
          changedAt: new Date().toISOString(),
          changedBy: ctx.userId,
          replacedFileId: replacedFile.id,
        }
        await tx.update(files)
          .set({ metadata: sql`${files.metadata} - 'isLatest'` })
          .where(eq(files.id, replacedFile.id))
        await tx.update(files)
          .set({ metadata: { ...targetMeta, isLatest: true, latestChangeNotes: [...notes, change] } })
          .where(eq(files.id, file.id))
      } else {
        await tx.update(files)
          .set({ metadata: { ...targetMeta, isLatest: true } })
          .where(eq(files.id, file.id))
      }
      return 'ok' as const
    })

    if (outcome === 'missing') return new NextResponse(null, { status: 404 })
    if (outcome === 'forbidden') return lockedForbidden ?? new NextResponse(null, { status: 403 })
    if (outcome === 'already_current') {
      return NextResponse.json({ error: '選択したファイルはすでに確定資料です' }, { status: 409 })
    }
    if (outcome === 'stale') {
      return NextResponse.json({ error: '差し替え元は現在の確定資料ではありません' }, { status: 409 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/projects/[id]/current-files]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
