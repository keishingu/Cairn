// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

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
  return row ?? null
}
