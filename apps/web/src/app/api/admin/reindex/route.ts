// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireWorkspaceAdmin } from '@/lib/permissions'

// ワークスペース内の全データを再インデックスする管理用エンドポイント
export async function POST() {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const forbidden = await requireWorkspaceAdmin(ctx.workspaceId, ctx.userId)
  if (forbidden) return forbidden

  try {
    const { db, files, activeWorkspaceMembers, profiles, projects, documentChunks } = await import('@cairn/db')
    const { and, eq, notInArray } = await import('drizzle-orm')
    const { inngest } = await import('@/lib/inngest/client')
    const { isIndexable } = await import('@/lib/ai/extract-text')

    const [allFiles, allMembers, allProjects] = await Promise.all([
      db.select({ id: files.id, mimeType: files.mimeType, storagePath: files.storagePath })
        .from(files)
        .where(eq(files.workspaceId, ctx.workspaceId)),
      // 再インデックスは active メンバーのみを対象にする
      db.select({ userId: activeWorkspaceMembers.userId })
        .from(activeWorkspaceMembers)
        .innerJoin(profiles, eq(activeWorkspaceMembers.userId, profiles.id))
        .where(and(
          eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId),
          eq(profiles.kind, 'human'),
        )),
      db.select({ id: projects.id })
        .from(projects)
        .where(eq(projects.workspaceId, ctx.workspaceId)),
    ])

    const indexableFiles = allFiles.filter(f => isIndexable(f.mimeType ?? ''))
    const activeMemberIds = allMembers.map(m => m.userId)

    // active member だけを再キューする前に、inactive 化で残った member chunk を消す。
    // searchChunks は workspace_id 単位で全 chunk を見るため、ここで stale な RAG context を掃除する。
    await db
      .delete(documentChunks)
      .where(and(
        eq(documentChunks.workspaceId, ctx.workspaceId),
        eq(documentChunks.sourceType, 'member'),
        ...(activeMemberIds.length > 0 ? [notInArray(documentChunks.sourceId, activeMemberIds)] : []),
      ))

    const events = [
      ...indexableFiles.map(f => ({
        name: 'file/uploaded' as const,
        data: { fileId: f.id, workspaceId: ctx.workspaceId, mimeType: f.mimeType ?? '', storagePath: f.storagePath },
      })),
      ...allMembers.map(m => ({
        name: 'member/upserted' as const,
        data: { userId: m.userId, workspaceId: ctx.workspaceId },
      })),
      ...allProjects.map(p => ({
        name: 'project/upserted' as const,
        data: { projectId: p.id, workspaceId: ctx.workspaceId },
      })),
    ]

    if (events.length > 0) {
      await inngest.send(events)
    }

    return NextResponse.json({
      queued: { files: indexableFiles.length, members: allMembers.length, projects: allProjects.length },
    })
  } catch (err) {
    console.error('[/api/admin/reindex]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
