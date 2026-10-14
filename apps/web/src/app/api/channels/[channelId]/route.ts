// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { SQL } from 'drizzle-orm'
import { WORKSPACE_CHANNEL_NAME_MAX } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess, requireRole } from '@/lib/permissions'

type RouteContext = { params: Promise<{ channelId: string }> }

async function loadWorkspaceChannel(workspaceId: string, channelId: string) {
  const { db, channels } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [channel] = await db
    .select({
      id: channels.id,
      parentChannelId: channels.parentChannelId,
    })
    .from(channels)
    .where(and(
      eq(channels.id, channelId),
      eq(channels.workspaceId, workspaceId),
      eq(channels.type, 'workspace'),
    ))
    .limit(1)
  return channel ?? null
}

function authorizeChange(
  role: Parameters<typeof requireRole>[0],
  parentChannelId: string | null,
  workspaceId: string,
  userId: string,
  channelId: string,
) {
  // 親チャンネルの作成は管理者以上、直下スレッドの作成はメンバー以上に揃える。
  const forbidden = requireRole(role, parentChannelId ? 'member' : 'admin')
  if (forbidden) return forbidden
  return requireChannelAccess(workspaceId, userId, channelId, role)
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { channelId } = await params

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 })
  }

  const body = typeof rawBody === 'object' && rawBody !== null && !Array.isArray(rawBody)
    ? rawBody as Record<string, unknown>
    : {}
  const hasName = body['name'] !== undefined
  const hasArchived = body['archived'] !== undefined
  if (!hasName && !hasArchived) {
    return NextResponse.json({ error: '変更内容を指定してください' }, { status: 400 })
  }
  if (hasArchived && typeof body['archived'] !== 'boolean') {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 })
  }

  const name = typeof body['name'] === 'string' ? body['name'].trim() : ''
  if (name.length > WORKSPACE_CHANNEL_NAME_MAX) {
    return NextResponse.json({ error: '60文字以内で入力してください' }, { status: 400 })
  }

  try {
    const channel = await loadWorkspaceChannel(ctx.workspaceId, channelId)
    if (!channel) return NextResponse.json({ error: 'チャンネルが見つかりません' }, { status: 404 })
    if (hasName && !name) {
      return NextResponse.json(
        { error: channel.parentChannelId ? 'スレッド名を入力してください' : 'チャンネル名を入力してください' },
        { status: 400 },
      )
    }
    // 親チャンネルを隠すと配下スレッドの置き場がなくなるため、アーカイブはスレッドだけに限る。
    if (hasArchived && !channel.parentChannelId) {
      return NextResponse.json({ error: 'アーカイブできるのはスレッドだけです' }, { status: 400 })
    }

    const forbidden = await authorizeChange(ctx.role, channel.parentChannelId, ctx.workspaceId, ctx.userId, channelId)
    if (forbidden) return forbidden

    const { db, channels } = await import('@cairn/db')
    const { and, eq, sql } = await import('drizzle-orm')
    const set: { name?: string; archivedAt?: SQL | null } = {}
    if (hasName) set.name = name
    // 既にアーカイブ済みなら日時を保つ。
    if (hasArchived) set.archivedAt = body['archived'] ? sql`coalesce(${channels.archivedAt}, now())` : null

    const [updated] = await db
      .update(channels)
      .set(set)
      .where(and(
        eq(channels.id, channelId),
        eq(channels.workspaceId, ctx.workspaceId),
        eq(channels.type, 'workspace'),
      ))
      .returning({
        id: channels.id,
        name: channels.name,
        // 名称変更はmigrationより先にデプロイされても動かす。
        archived: sql<boolean>`coalesce(to_jsonb(${channels})->>'archived_at', '') <> ''`,
      })

    if (!updated?.name) return NextResponse.json({ error: 'チャンネルが見つかりません' }, { status: 404 })
    return NextResponse.json({ id: updated.id, name: updated.name, archived: updated.archived })
  } catch (err) {
    console.error('[/api/channels/[channelId] PATCH] DB error:', err)
    return NextResponse.json(
      { error: hasArchived && !hasName ? 'アーカイブの変更に失敗しました' : '名前の変更に失敗しました' },
      { status: 500 },
    )
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { channelId } = await params

  try {
    const channel = await loadWorkspaceChannel(ctx.workspaceId, channelId)
    if (!channel) return NextResponse.json({ error: 'チャンネルが見つかりません' }, { status: 404 })

    const forbidden = await authorizeChange(ctx.role, channel.parentChannelId, ctx.workspaceId, ctx.userId, channelId)
    if (forbidden) return forbidden

    const { db, channels } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')
    const [deleted] = await db
      .delete(channels)
      .where(and(
        eq(channels.id, channelId),
        eq(channels.workspaceId, ctx.workspaceId),
        eq(channels.type, 'workspace'),
      ))
      .returning({ id: channels.id })

    if (!deleted) return NextResponse.json({ error: 'チャンネルが見つかりません' }, { status: 404 })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[/api/channels/[channelId] DELETE] DB error:', err)
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
  }
}
