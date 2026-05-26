// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'

export interface ProjectFileDto {
  id: string
  fileName: string
  mimeType: string | null
  fileSize: number | null
  fileType: string
  uploaderName: string
  createdAt: string
  externalUrl?: string
  indexingStatus?: string
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { id: projectId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json([] satisfies ProjectFileDto[])
  }

  try {
    const { db, files, profiles, projects } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const { desc } = await import('drizzle-orm')

    // プロジェクトが同一ワークスペースに属することを確認
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) {
      return new NextResponse(null, { status: 404 })
    }

    const rows = await db
      .select({
        id: files.id,
        fileName: files.fileName,
        mimeType: files.mimeType,
        fileSize: files.fileSize,
        fileType: files.fileType,
        uploaderName: profiles.displayName,
        createdAt: files.createdAt,
        metadata: files.metadata,
      })
      .from(files)
      .innerJoin(profiles, eq(files.uploadedBy, profiles.id))
      .where(eq(files.projectId, projectId))
      .orderBy(desc(files.createdAt))

    return NextResponse.json(
      rows.map(r => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>
        const externalUrl = meta['externalUrl']
        const indexingStatus = meta['indexingStatus']
        return {
          id: r.id,
          fileName: r.fileName,
          mimeType: r.mimeType,
          fileSize: r.fileSize,
          fileType: r.fileType,
          uploaderName: r.uploaderName,
          createdAt: r.createdAt.toISOString(),
          ...(typeof externalUrl === 'string' ? { externalUrl } : {}),
          ...(typeof indexingStatus === 'string' ? { indexingStatus } : {}),
        }
      }) satisfies ProjectFileDto[],
    )
  } catch (err) {
    console.error('[/api/projects/[id]/files GET] DB query failed:', err)
    return NextResponse.json([] satisfies ProjectFileDto[])
  }
}
