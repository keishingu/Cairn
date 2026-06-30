// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess, requireProjectAccess, requireWorkspaceMember } from '@/lib/permissions'

const GOOGLE_DOC_RE = /https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/
const GOOGLE_SHEET_RE = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/
const GOOGLE_SLIDE_RE = /https:\/\/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/
const GOOGLE_DRIVE_RE = /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/

export type ExternalLinkDocType = 'doc' | 'sheet' | 'slide' | 'drive'

export interface ExternalLinkDto {
  fileId: string
  fileName: string
  externalUrl: string
  docType: ExternalLinkDocType
  docId: string
  indexingStatus: 'pending' | 'indexed' | 'failed' | 'skipped'
  alreadyExists?: boolean
}

function parseGoogleUrl(url: string): { docId: string; docType: ExternalLinkDocType; label: string } | null {
  const docMatch = GOOGLE_DOC_RE.exec(url)
  if (docMatch) return { docId: docMatch[1]!, docType: 'doc', label: 'Google ドキュメント' }
  const sheetMatch = GOOGLE_SHEET_RE.exec(url)
  if (sheetMatch) return { docId: sheetMatch[1]!, docType: 'sheet', label: 'Google スプレッドシート' }
  const slideMatch = GOOGLE_SLIDE_RE.exec(url)
  if (slideMatch) return { docId: slideMatch[1]!, docType: 'slide', label: 'Google スライド' }
  const driveMatch = GOOGLE_DRIVE_RE.exec(url)
  if (driveMatch) return { docId: driveMatch[1]!, docType: 'drive', label: 'Google Drive ファイル' }
  return null
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: { url: string; channelId?: string; projectId?: string }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { url, channelId, projectId: bodyProjectId } = body
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url は必須です' }, { status: 400 })
  }

  const parsed = parseGoogleUrl(url)
  if (!parsed) {
    return NextResponse.json(
      { error: 'サポートされていないURLです（Google ドキュメント/スプレッドシート/スライドのみ対応）' },
      { status: 400 },
    )
  }

  const { docId, docType, label } = parsed

  try {
    const { db, files, channels, projects } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    // channelId からプロジェクトIDを解決
    let projectId: string | null = bodyProjectId ?? null
    let metadataChannelId: string | null = null
    if (channelId) {
      const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId)
      if (forbidden) return forbidden

      const [ch] = await db
        .select({ projectId: channels.projectId })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1)
      if (projectId && ch?.projectId && ch.projectId !== projectId) {
        return NextResponse.json({ error: 'channelId と projectId が一致しません' }, { status: 400 })
      }
      projectId = projectId ?? ch?.projectId ?? null
      metadataChannelId = channelId
    }

    if (projectId) {
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
        .limit(1)

      if (!project) return new NextResponse(null, { status: 404 })
    }

    // ゲストは参加プロジェクトにのみリンクを登録できる。プロジェクト未指定（WSレベル）はゲスト不可。
    const forbidden = projectId
      ? await requireProjectAccess(ctx.workspaceId, ctx.userId, projectId)
      : await requireWorkspaceMember(ctx.workspaceId, ctx.userId)
    if (forbidden) return forbidden

    // 同一プロジェクト内の重複チェック
    if (projectId) {
      const existing = await db
        .select({ id: files.id, metadata: files.metadata })
        .from(files)
        .where(and(eq(files.projectId, projectId), eq(files.fileType, 'link')))

      const dup = existing.find(
        f => (f.metadata as Record<string, unknown>)?.['externalUrl'] === url,
      )
      if (dup) {
        const dupMeta = (dup.metadata ?? {}) as Record<string, unknown>
        const rawStatus = dupMeta['indexingStatus']
        const indexingStatus = (rawStatus === 'pending' || rawStatus === 'indexed' || rawStatus === 'failed' || rawStatus === 'skipped')
          ? rawStatus
          : 'pending' as const
        return NextResponse.json({
          fileId: dup.id,
          fileName: label,
          externalUrl: url,
          docType,
          docId,
          indexingStatus,
          alreadyExists: true,
        } satisfies ExternalLinkDto)
      }
    }

    const initialStatus = docType === 'doc' ? 'pending' : 'skipped'
    const metadata = {
      externalUrl: url,
      docType,
      docId,
      indexingStatus: initialStatus,
      ...(metadataChannelId ? { channelId: metadataChannelId } : {}),
    }

    const [inserted] = await db
      .insert(files)
      .values({
        workspaceId: ctx.workspaceId,
        projectId,
        uploadedBy: ctx.userId,
        storagePath: null,
        fileName: label,
        mimeType: null,
        fileSize: null,
        fileType: 'link',
        metadata,
      })
      .returning()

    if (!inserted) throw new Error('Insert returned no rows')

    // Google ドキュメントのみ RAG インデックスを非同期で試行
    if (docType === 'doc') {
      try {
        const { inngest } = await import('@/lib/inngest/client')
        await inngest.send({
          name: 'link/registered',
          data: { fileId: inserted.id, workspaceId: ctx.workspaceId, docId },
        })
      } catch (e) {
        console.warn('[/api/external-links] Inngest event send failed (indexing skipped):', e)
      }
    }

    return NextResponse.json(
      {
        fileId: inserted.id,
        fileName: label,
        externalUrl: url,
        docType,
        docId,
        indexingStatus: initialStatus,
      } satisfies ExternalLinkDto,
      { status: 201 },
    )
  } catch (err) {
    console.error('[POST /api/external-links]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
