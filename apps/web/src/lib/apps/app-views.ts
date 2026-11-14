// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { forThisDeployment } from './first-party'

// 利用者側のモーダル（app_views）の読み出し。開けるのは本人のもの・同じワークスペースで有効なインストールのものだけ

export type OpenAppView = {
  id: string
  view: unknown
  hash: string
  installationId: string
  appId: string
  appName: string
  appIconUrl: string | null
  channelId: string | null
  requestUrl: string | null
  signingSecretEncrypted: string | null
}

export async function findOpenAppView(input: { viewId: string; userId: string; workspaceId: string }): Promise<OpenAppView | null> {
  const { db, appViews, appInstallations, apps } = await import('@cairn/db')
  const { and, eq, isNull } = await import('drizzle-orm')
  const [row] = await db
    .select({
      id: appViews.id,
      view: appViews.view,
      hash: appViews.hash,
      installationId: appInstallations.id,
      appId: apps.id,
      appName: apps.name,
      appIconUrl: apps.iconUrl,
      channelId: appViews.channelId,
      requestUrl: apps.requestUrl,
      slug: apps.slug,
      ownerWorkspaceId: apps.ownerWorkspaceId,
      signingSecretEncrypted: apps.signingSecretEncrypted,
    })
    .from(appViews)
    .innerJoin(appInstallations, eq(appInstallations.id, appViews.installationId))
    .innerJoin(apps, eq(apps.id, appInstallations.appId))
    .where(
      and(
        eq(appViews.id, input.viewId),
        eq(appViews.userId, input.userId),
        eq(appViews.status, 'open'),
        eq(appInstallations.workspaceId, input.workspaceId),
        isNull(appInstallations.revokedAt),
      ),
    )
    .limit(1)
  if (!row) return null
  // ファーストパーティはこのデプロイの定義の経路へ送る。このデプロイが知らないアプリなら送り先なし（app_not_interactive）
  const deployed = forThisDeployment(row)
  return {
    id: row.id,
    view: row.view,
    hash: row.hash,
    installationId: row.installationId,
    appId: row.appId,
    appName: row.appName,
    appIconUrl: row.appIconUrl,
    channelId: row.channelId,
    requestUrl: deployed ? deployed.requestUrl : null,
    signingSecretEncrypted: row.signingSecretEncrypted,
  }
}
