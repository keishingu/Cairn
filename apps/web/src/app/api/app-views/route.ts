// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { isFirstPartyApp } from '@/lib/apps/first-party'
import { buildMentionNameMap } from '@/lib/chat/mention-name-map'
import { extractMentionIds } from '@/lib/chat/mentions'

export interface AppViewDto {
  id: string
  /** views.update で変わる。クライアントはこれが変わったら入力状態を作り直す */
  hash: string
  view: unknown
  appName: string
  /** ファーストパーティのアプリ。名前（英語）を表示言語に翻訳して出す */
  firstParty: boolean
  appIconUrl: string | null
  /** モーダル内のメンション（`<@id>`）の表示名（非活性のメンバーも含む、サーバーで解決したもの） */
  mentionNames: Record<string, string>
}

// 自分に開かれているモーダル（新しい順）。アプリが views.open すると Realtime で本人のトピックへ知らされ、クライアントがこれを取り直す
export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  try {
    const { db, appViews, appInstallations, apps } = await import('@cairn/db')
    const { and, desc, eq, isNull } = await import('drizzle-orm')
    const rows = await db
      .select({ id: appViews.id, hash: appViews.hash, view: appViews.view, appName: apps.name, appIconUrl: apps.iconUrl, appSlug: apps.slug, appOwnerWorkspaceId: apps.ownerWorkspaceId })
      .from(appViews)
      .innerJoin(appInstallations, eq(appInstallations.id, appViews.installationId))
      .innerJoin(apps, eq(apps.id, appInstallations.appId))
      .where(and(eq(appViews.userId, ctx.userId), eq(appViews.status, 'open'), eq(appInstallations.workspaceId, ctx.workspaceId), isNull(appInstallations.revokedAt)))
      .orderBy(desc(appViews.createdAt))
      .limit(10)
    // カードと同じく、クライアントのメンバー一覧（active だけ）に無い人も「不明なメンバー」にしない
    const visibleViews = rows.map((row) => withoutPrivateMetadata(row.view))
    const viewJsons = visibleViews.map((view) => JSON.stringify(view))
    const nameMap = await buildMentionNameMap(ctx.workspaceId, viewJsons)
    const result = rows.map(({ appSlug, appOwnerWorkspaceId, ...row }, index) => ({
      ...row,
      firstParty: isFirstPartyApp({ slug: appSlug, ownerWorkspaceId: appOwnerWorkspaceId }),
      // private_metadata はアプリが自分のために持つ値。描画には使わず、送信はサーバーの保存値から組み立てるので利用者へは渡さない
      view: visibleViews[index],
      mentionNames: Object.fromEntries(
        extractMentionIds(viewJsons[index]!).flatMap((id) => {
          const name = nameMap.get(id)
          return name ? [[id, name] as const] : []
        }),
      ),
    }))
    return NextResponse.json(result satisfies AppViewDto[])
  } catch (err) {
    // デプロイがマイグレーションより先に動いた間（app_views が未作成）は、開いたモーダルがあり得ないので空にする。
    // この取得は全画面で動くため、ここで 500 にすると全利用者にエラーが出続ける
    if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '42P01') {
      console.warn('[/api/app-views GET] app_views is not migrated yet:', err)
      return NextResponse.json([] satisfies AppViewDto[])
    }
    console.error('[/api/app-views GET] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function withoutPrivateMetadata(view: unknown): unknown {
  if (typeof view !== 'object' || view === null) return view
  const rest = { ...(view as Record<string, unknown>) }
  delete rest['private_metadata']
  return rest
}
