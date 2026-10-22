// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess, requireRole } from '@/lib/permissions'
import { isChannelArchived } from '@/lib/apps/channel-apps'

const bodySchema = z.object({ installationId: z.string().uuid() })

// Bot をチャンネルへ追加する。そのチャンネルにアクセスできる member 以上ができ、監査ログに残す（§11 D6）。
// DM には追加させない（第1段階は Bot に DM へ投稿させない）
export async function POST(req: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const notMember = requireRole(ctx.role, 'member')
  if (notMember) return notMember
  const { channelId } = await params
  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
  if (forbidden) return forbidden

  let installationId: string
  try {
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    installationId = parsed.data.installationId
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  try {
    const { db, appInstallations, appChannelMemberships, channels, auditLogs } = await import('@cairn/db')
    const { and, eq, isNull } = await import('drizzle-orm')
    const [channel] = await db
      .select({ type: channels.type, archivedAt: channels.archivedAt, parentChannelId: channels.parentChannelId })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1)
    // 確認中にアーカイブされたチャンネルにも追加しない（追加だけ残って、続く起動は channel_archived で失敗する）
    if (!channel || channel.type === 'dm' || (await isChannelArchived(channel))) return NextResponse.json({ error: 'このチャンネルにはアプリを追加できません' }, { status: 422 })
    const [installation] = await db
      .select({ id: appInstallations.id })
      .from(appInstallations)
      .where(and(eq(appInstallations.id, installationId), eq(appInstallations.workspaceId, ctx.workspaceId), isNull(appInstallations.revokedAt)))
      .limit(1)
    if (!installation) return NextResponse.json({ error: 'アプリが見つかりません' }, { status: 404 })

    await db.transaction(async (tx) => {
      // workspace_id は複合 FK で installation とチャンネルの両方に一致させる（別ワークスペースのチャンネルへは入らない）
      const inserted = await tx
        .insert(appChannelMemberships)
        .values({ installationId, channelId, workspaceId: ctx.workspaceId, addedBy: ctx.userId })
        .onConflictDoNothing()
        .returning({ channelId: appChannelMemberships.channelId })
      if (inserted.length > 0) {
        await tx.insert(auditLogs).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          entityType: 'app_channel_membership',
          entityId: installationId,
          action: 'add',
          payload: { channelId },
        })
      }
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/channels/[channelId]/apps POST] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
