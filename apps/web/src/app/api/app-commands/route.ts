// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { decryptToken } from '@/lib/token-crypto'
import { getActiveMemberIdentity } from '@/lib/access/membership'
import { isAppInChannel, isChannelArchived, parseEntryPoints } from '@/lib/apps/channel-apps'
import { resolveRequestTarget } from '@/lib/apps/first-party'
import { deliverToApp } from '@/lib/apps/interactions'
import { recordDeliveryAfterResponse } from '@/lib/apps/delivery-log'
import { issueTrigger } from '@/lib/apps/triggers'

// 入力欄の「＋」から選んだアプリの起動口を、スラッシュコマンドと同じ形（フィールドを並べた form）でアプリへ届ける。
// コンポーザーで `/poll` と打つ入力（第2段階）を足しても、アプリ側の受け口は変わらない（docs/app-platform-design.md §6.1）

const bodySchema = z.object({ installationId: z.string().uuid(), channelId: z.string().uuid(), command: z.string().min(1).max(64) })

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  let body: z.infer<typeof bodySchema>
  try {
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    body = parsed.data
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, body.channelId, ctx.role)
  if (forbidden) return forbidden

  try {
    const { db, apps, appInstallations, channels, workspaces } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')
    const [row] = await db
      .select({
        installationId: appInstallations.id,
        workspaceId: appInstallations.workspaceId,
        revokedAt: appInstallations.revokedAt,
        appId: apps.id,
        requestUrl: apps.requestUrl,
        signingSecretEncrypted: apps.signingSecretEncrypted,
        entryPoints: apps.entryPoints,
      })
      .from(appInstallations)
      .innerJoin(apps, eq(apps.id, appInstallations.appId))
      .where(eq(appInstallations.id, body.installationId))
      .limit(1)
    if (!row || row.workspaceId !== ctx.workspaceId) return NextResponse.json({ error: 'app_not_found' }, { status: 404 })
    if (row.revokedAt) return NextResponse.json({ error: 'app_uninstalled' }, { status: 409 })
    if (!parseEntryPoints(row.entryPoints).some((entry) => entry.command === body.command)) return NextResponse.json({ error: 'app_not_found' }, { status: 404 })
    if (!row.requestUrl || !row.signingSecretEncrypted) return NextResponse.json({ error: 'app_not_interactive' }, { status: 409 })

    const [channel] = await db
      .select({ name: channels.name, type: channels.type, parentChannelId: channels.parentChannelId, archivedAt: channels.archivedAt })
      .from(channels)
      .where(eq(channels.id, body.channelId))
      .limit(1)
    if (!channel || channel.type === 'dm') return NextResponse.json({ error: 'app_not_in_channel' }, { status: 409 })
    // アーカイブ済み（スレッドを含む）にはアプリが投稿できない。起動してフォームを開かせてから投稿だけ失敗させない
    if (await isChannelArchived(channel)) return NextResponse.json({ error: 'channel_archived' }, { status: 409 })
    if (!(await isAppInChannel(row.installationId, body.channelId, channel.parentChannelId))) return NextResponse.json({ error: 'app_not_in_channel' }, { status: 409 })

    const [[workspace], [member]] = await Promise.all([
      db.select({ slug: workspaces.slug }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId)).limit(1),
      // 非活性になった人は未所属と同じ。認証の後に非活性になっていたら null になり、下で断る
      getActiveMemberIdentity(ctx.workspaceId, ctx.userId).then((identity) => [identity]),
    ])
    // 認証の後にワークスペースや利用者が消えていたら、空の名前で署名付きのコマンドを届けない
    if (!workspace || !member) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
    const triggerId = await issueTrigger({ installationId: row.installationId, userId: ctx.userId, channelId: body.channelId })
    const delivery = await deliverToApp({
      ...resolveRequestTarget(row.requestUrl),
      signingSecret: decryptToken(row.signingSecretEncrypted),
      // Slack のスラッシュコマンドと同じフィールド（ID は UUID のまま。§11 D3）
      form: {
        token: '',
        team_id: ctx.workspaceId,
        team_domain: workspace.slug,
        channel_id: body.channelId,
        channel_name: channel.name ?? '',
        user_id: ctx.userId,
        user_name: member.name,
        command: body.command,
        text: '',
        api_app_id: row.appId,
        is_enterprise_install: 'false',
        trigger_id: triggerId,
      },
    })
    recordDeliveryAfterResponse({ installationId: row.installationId, userId: ctx.userId, type: 'slash_command', actionId: body.command, delivery })
    if (delivery.status !== 'delivered') return NextResponse.json({ error: delivery.status === 'timeout' ? 'app_timeout' : 'app_unreachable' }, { status: 502 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/app-commands POST] failed:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
