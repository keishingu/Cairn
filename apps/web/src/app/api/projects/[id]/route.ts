// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireWorkspaceAdmin, requireWorkspaceMember } from '@/lib/permissions'

// Google Places API v1 の photo name は "places/.../photos/..." 形式。
// path traversal や URL インジェクションを防ぐため英数字・アンダースコア・スラッシュのみ許可する。
const PLACE_PHOTO_NAME_RE = /^[A-Za-z0-9_/-]+$/

const patchProjectSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  startDate: z.string().date().nullable().optional(),
  endDate: z.string().date().nullable().optional(),
  statusName: z.string().max(100).optional(),
  archived: z.boolean().optional(),
  coverPhotoUrl: z.string().url().nullable().optional(),
  placePhotoName: z.string().max(500).regex(PLACE_PHOTO_NAME_RE, 'placePhotoName に使用できない文字が含まれています').optional(),
  location: z.string().max(500).nullable().optional(),
  placeId: z.string().max(500).nullable().optional(),
})

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params

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

    const forbidden = await requireWorkspaceAdmin(ctx.workspaceId, ctx.userId)
    if (forbidden) return forbidden

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

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchProjectSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'リクエストが不正です' }, { status: 422 })
  }
  const b = parsed.data
  if (Object.keys(b).length === 0) {
    return NextResponse.json({ error: 'At least one field is required' }, { status: 422 })
  }

  try {
    const { db } = await import('@cairn/db')
    const { projects, projectStatuses } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const { getAuthContext } = await import('@/lib/get-auth-context')

    const { ctx, error } = await getAuthContext()
    if (error) return error

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const forbidden = await requireWorkspaceMember(ctx.workspaceId, ctx.userId)
    if (forbidden) return forbidden

    let resolvedCoverPhotoUrl: string | null | undefined = undefined

    if (b.placePhotoName) {
      const apiKey = process.env['GOOGLE_MAPS_API_KEY']
      if (apiKey) {
        try {
          const mediaRes = await fetch(
            `https://places.googleapis.com/v1/${b.placePhotoName}/media?maxWidthPx=1200&skipHttpRedirect=true&key=${apiKey}`,
          )
          if (mediaRes.ok) {
            const media = await mediaRes.json() as { photoUri?: string }
            if (media.photoUri) {
              const imgRes = await fetch(media.photoUri)
              if (imgRes.ok) {
                const buffer = await imgRes.arrayBuffer()
                const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
                const ext = contentType.includes('png') ? 'png' : 'jpg'
                const slug = b.placePhotoName.split('/').join('_')
                const storagePath = `place-photos/${slug}.${ext}`
                const { createServiceRoleClient } = await import('@/lib/supabase/service')
                const supabase = createServiceRoleClient()
                const { error: uploadError } = await supabase.storage
                  .from('covers')
                  .upload(storagePath, buffer, { contentType, upsert: false })
                if (!uploadError || uploadError.message.toLowerCase().includes('already exist')) {
                  const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(storagePath)
                  resolvedCoverPhotoUrl = publicUrl
                }
              }
            }
          }
        } catch (e) {
          console.warn('[PATCH /api/projects/[id]] place photo upload failed (skipped):', e)
        }
      }
    } else if ('coverPhotoUrl' in (b as object)) {
      resolvedCoverPhotoUrl = b.coverPhotoUrl ?? null
    }
    const set: {
      title?: string
      description?: string | null
      startDate?: string | null
      endDate?: string | null
      statusId?: string | null
      archived?: boolean
      coverPhotoUrl?: string | null
      location?: string | null
      placeId?: string | null
      updatedAt: Date
    } = { updatedAt: new Date() }

    if (b.title !== undefined) set.title = b.title
    if ('description' in (b as object)) set.description = b.description ?? null
    if ('startDate' in (b as object)) set.startDate = b.startDate ?? null
    if ('endDate' in (b as object)) set.endDate = b.endDate ?? null
    if (b.archived !== undefined) set.archived = b.archived
    if (resolvedCoverPhotoUrl !== undefined) set.coverPhotoUrl = resolvedCoverPhotoUrl
    if ('location' in (b as object)) set.location = b.location ?? null
    if ('placeId' in (b as object)) set.placeId = b.placeId ?? null

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

    // プロジェクトのステータス・日程・概要・名称の変更をプロジェクトチャンネルに system メッセージで通知する。
    // チーム共通の重要情報（決定事項）をチャットに残すための仕組み。失敗しても PATCH 自体は成功させる
    try {
      const datesChanged = 'startDate' in (b as object) || 'endDate' in (b as object)
      const changes: string[] = []
      if (b.statusName !== undefined) changes.push(`ステータスを「${b.statusName}」に変更しました`)
      if (datesChanged) {
        const [p] = await db
          .select({ startDate: projects.startDate, endDate: projects.endDate })
          .from(projects)
          .where(eq(projects.id, id))
        const s = p?.startDate ?? '未設定'
        const e = p?.endDate ?? '未設定'
        changes.push(`期間を ${s} 〜 ${e} に変更しました`)
      }
      if ('description' in (b as object)) changes.push('概要を更新しました')
      if (b.title !== undefined) changes.push(`プロジェクト名を「${b.title}」に変更しました`)

      if (changes.length > 0) {
        const { channels, messages, profiles } = await import('@cairn/db')
        const [channel] = await db
          .select({ id: channels.id })
          .from(channels)
          .where(and(eq(channels.projectId, id), eq(channels.type, 'project')))
          .limit(1)
        if (channel) {
          const [actor] = await db
            .select({ displayName: profiles.displayName })
            .from(profiles)
            .where(eq(profiles.id, ctx.userId))
          const actorName = actor?.displayName ?? '不明'
          await db.insert(messages).values({
            channelId: channel.id,
            senderId: ctx.userId,
            messageType: 'system',
            content: `${actorName}さんがプロジェクトを更新しました：${changes.join(' / ')}`,
          })
        }
      }
    } catch (e) {
      console.warn('[PATCH /api/projects/[id]] system message insert failed (skipped):', e)
    }

    const { placePhotoName: _, ...rest } = b
    return NextResponse.json({
      id,
      ...rest,
      ...(resolvedCoverPhotoUrl !== undefined && { coverPhotoUrl: resolvedCoverPhotoUrl }),
    })
  } catch (err) {
    console.error('[PATCH /api/projects/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
