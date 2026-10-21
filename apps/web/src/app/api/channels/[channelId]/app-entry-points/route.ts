// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess, requireRole } from '@/lib/permissions'
import { ensureFirstPartyInstallations, forThisDeployment } from '@/lib/apps/first-party'
import { isAppInChannel, isChannelArchived, parseEntryPoints, type EntryPoint } from '@/lib/apps/channel-apps'

export interface AppEntryPointDto {
  installationId: string
  appName: string
  appIconUrl: string | null
  /** Bot がこのチャンネルにまだいなければ、起動前に追加を確かめる */
  inChannel: boolean
  entryPoints: EntryPoint[]
}

// 入力欄の「＋」に並べる、このチャンネルで起動できるアプリ（docs/app-platform-design.md §6.1）。DM では出さない
export async function GET(_req: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const { channelId } = await params
  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
  if (forbidden) return forbidden

  try {
    const { db, apps, appInstallations, channels } = await import('@cairn/db')
    const { and, eq, isNull } = await import('drizzle-orm')
    const [channel] = await db
      .select({ type: channels.type, parentChannelId: channels.parentChannelId, archivedAt: channels.archivedAt })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1)
    // アーカイブ済みのチャンネル・スレッドではアプリが投稿できないので、起動口を出さない
    if (!channel || channel.type === 'dm' || (await isChannelArchived(channel))) return NextResponse.json([] satisfies AppEntryPointDto[])

    // 既定のインストールが欠けていたら補う（ワークスペース作成時に失敗した・本機能より前に作られたワークスペース）
    await ensureFirstPartyInstallations(ctx.workspaceId)
    const rows = await db
      .select({ installationId: appInstallations.id, appName: apps.name, appIconUrl: apps.iconUrl, entryPoints: apps.entryPoints, slug: apps.slug, ownerWorkspaceId: apps.ownerWorkspaceId, requestUrl: apps.requestUrl })
      .from(appInstallations)
      .innerJoin(apps, eq(apps.id, appInstallations.appId))
      .where(and(eq(appInstallations.workspaceId, ctx.workspaceId), isNull(appInstallations.revokedAt)))

    const result = await Promise.all(
      rows
        // ファーストパーティはこのデプロイの定義の起動口を出す（このデプロイが知らないアプリは出さない）
        .flatMap((found) => {
          const row = forThisDeployment(found)
          return row ? [{ ...row, entryPoints: parseEntryPoints(row.entryPoints) }] : []
        })
        .filter((row) => row.entryPoints.length > 0)
        .map(async (row) => ({
          installationId: row.installationId,
          appName: row.appName,
          appIconUrl: row.appIconUrl,
          inChannel: await isAppInChannel(row.installationId, channelId, channel.parentChannelId),
          entryPoints: row.entryPoints,
        })),
    )
    // Bot をチャンネルへ追加できない人（POST /apps と同じ requireRole の判定）には、追加が要る起動口を Web・ネイティブとも出さない
    const canAddApps = requireRole(ctx.role, 'member') === null
    const visible = canAddApps ? result : result.filter((app) => app.inChannel)
    return NextResponse.json(visible satisfies AppEntryPointDto[])
  } catch (err) {
    console.error('[/api/channels/[channelId]/app-entry-points GET] failed:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
