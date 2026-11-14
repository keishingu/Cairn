// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import { DOC_MIME_TYPES, parseFileListParams } from '@/lib/files/file-list-query'
import { buildFileFilterConditions, buildVisibleFilesConditions } from '@/lib/files/visible-files'
import type { FileTypeFilter } from '@/lib/files/saved-file-filter'

export interface FileFacetOption {
  id: string
  label: string
}

export interface FileFacetsResponse {
  /** 見えるファイル全体の種類別件数（絞り込み前） */
  typeCounts: Record<FileTypeFilter, number>
  /** 絞り込みの選択肢（絞り込み前の全体から作る） */
  projects: FileFacetOption[]
  uploaders: FileFacetOption[]
  /** 絞り込み後の件数。キーはプロジェクト ID、プロジェクトなしは 'none' */
  projectCounts: Record<string, number>
}

/**
 * ファイル一覧はページ単位で読むため、種類別の件数・絞り込みの選択肢・プロジェクト別の件数は
 * 全件を読まずに集計だけを返す。クエリパラメータは GET /api/files と同じ絞り込み条件を受け付ける。
 */
export async function GET(request: Request) {
  try {
    const { ctx, error } = await getAuthContext({
      allowApiToken: true,
      requiredApiTokenScope: 'read',
    })
    if (error) return error

    const role = ctx.role
    if (!role) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 })
    }

    const parsed = parseFileListParams(new URL(request.url).searchParams)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { db, files, profiles, projects, workspaceMembers } = await import('@cairn/db')
    const { eq, and, inArray, isNotNull, sql, count } = await import('drizzle-orm')

    const { visibleWhere, navigableChannelCondition } =
      await buildVisibleFilesConditions({ userId: ctx.userId, workspaceId: ctx.workspaceId, role })
    const filterConditions = await buildFileFilterConditions(parsed.filters, navigableChannelCondition)

    const [typeCountRows, projectRows, uploaderRows, projectCountRows] = await Promise.all([
      db
        .select({
          all: count(),
          pdf: sql<number>`count(*) filter (where ${files.mimeType} = 'application/pdf')`.mapWith(Number),
          img: sql<number>`count(*) filter (where ${files.mimeType} like 'image/%')`.mapWith(Number),
          doc: sql<number>`count(*) filter (where ${inArray(files.mimeType, DOC_MIME_TYPES)})`.mapWith(Number),
        })
        .from(files)
        .where(visibleWhere),
      db
        .selectDistinct({ id: projects.id, label: projects.title })
        .from(files)
        .innerJoin(projects, eq(files.projectId, projects.id))
        .where(and(visibleWhere, isNotNull(files.projectId))),
      db
        .selectDistinct({
          id: files.uploadedBy,
          label: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
        })
        .from(files)
        .innerJoin(profiles, eq(files.uploadedBy, profiles.id))
        .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, files.uploadedBy), eq(workspaceMembers.workspaceId, ctx.workspaceId)))
        .where(visibleWhere),
      db
        .select({ projectId: files.projectId, count: count() })
        .from(files)
        .where(and(visibleWhere, ...filterConditions))
        .groupBy(files.projectId),
    ])

    const typeCounts = typeCountRows[0]
    if (!typeCounts) throw new Error('count query returned no rows')

    const byLabel = (a: FileFacetOption, b: FileFacetOption) => a.label.localeCompare(b.label, 'ja')

    return NextResponse.json({
      typeCounts: { all: typeCounts.all, pdf: typeCounts.pdf, img: typeCounts.img, doc: typeCounts.doc },
      projects: projectRows.sort(byLabel),
      uploaders: uploaderRows.sort(byLabel),
      projectCounts: Object.fromEntries(projectCountRows.map(r => [r.projectId ?? 'none', r.count])),
    } satisfies FileFacetsResponse)
  } catch (err) {
    console.error('[GET /api/files/facets] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
