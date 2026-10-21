// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createHmac } from 'node:crypto'
import { APP_SCOPES } from '@cairn/db'
import { encryptToken, decryptToken } from '@/lib/token-crypto'
import { createBotToken } from './bot-tokens'

// ファーストパーティのアプリ（投票など）。全ワークスペースに既定でインストール済みにし、Bot のチャンネル追加は手動（§11 D7）。
// 作成は冪等な ensureFirstPartyInstallations に一本化し、ワークスペース作成時と、起動口・トークンを使う時点で欠けを補う。
// 投票アプリのコードはこのファイルの公開関数（Bot トークン・署名シークレット）だけを使い、ほかの Cairn 本体の関数は使わない（§7.1）

export type FirstPartyAppSlug = 'polls'

type FirstPartyAppDefinition = {
  slug: FirstPartyAppSlug
  name: string
  description: string
  /** Request URL のパス。送る時点で今のデプロイの URL を前に付ける（§ resolveRequestUrl） */
  requestPath: string
  /** 作成メニューの起動口。label は英語のキーで、表示時に翻訳する */
  entryPoints: Array<{ command: string; label: string }>
}

export const FIRST_PARTY_APPS: readonly FirstPartyAppDefinition[] = [
  {
    slug: 'polls',
    name: '投票',
    description: 'チャンネルで投票をとる',
    requestPath: '/api/first-party-apps/polls/interactions',
    entryPoints: [{ command: '/poll', label: 'Create a poll' }],
  },
]

/**
 * アプリの今のデプロイの URL。Preview と develop は同じ DB を共有するため、ファーストパーティの Request URL は
 * 絶対 URL で保存せず、送る時点でこの URL を付ける（デプロイごとに保存値を書き換え合わない）。
 * Vercel の Preview（develop を含む）は、同じコードの版へ届くようデプロイ固有の VERCEL_URL を優先する（APP_URL の正規ホストは別の版が動いている）。
 * 本番は、Deployment Protection で守られるデプロイ固有 URL ではなく公開の APP_URL へ送る
 */
export function appBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const appUrl = env['APP_URL']?.replace(/\/$/, '')
  if (env['VERCEL_URL'] && env['VERCEL_ENV'] !== 'production') return `https://${env['VERCEL_URL']}`
  if (appUrl) return appUrl
  if (env['VERCEL_URL']) return `https://${env['VERCEL_URL']}`
  throw new Error('APP_URL is not configured')
}

/** 保存値が `/` で始まるパスなら（ファーストパーティ）、今のデプロイの URL を付ける。外部アプリの絶対 URL はそのまま */
export function resolveRequestUrl(stored: string, env: NodeJS.ProcessEnv = process.env): string {
  return stored.startsWith('/') ? `${appBaseUrl(env)}${stored}` : stored
}

/**
 * 同じデプロイへの呼び出し（ファーストパーティの Request URL・投票アプリの Bot API）に付けるヘッダー。
 * Preview のデプロイ固有 URL は Deployment Protection がかかるため、Vercel の「Protection Bypass for Automation」を
 * 有効にしたときに配られる VERCEL_AUTOMATION_BYPASS_SECRET を付けて通す。外部アプリへは決して付けない
 */
export function selfCallHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const secret = env['VERCEL_AUTOMATION_BYPASS_SECRET']
  return secret ? { 'x-vercel-protection-bypass': secret } : {}
}

/** 配送先の URL と、同じデプロイへの呼び出しならそのためのヘッダー */
export function resolveRequestTarget(stored: string, env: NodeJS.ProcessEnv = process.env): { requestUrl: string; headers: Record<string, string> } {
  return { requestUrl: resolveRequestUrl(stored, env), headers: stored.startsWith('/') ? selfCallHeaders(env) : {} }
}

/**
 * ファーストパーティの署名シークレット。新しい環境変数を増やさず、既存の暗号鍵から用途ごとに導く（鍵が無ければ例外）。
 * アプリ側の検証も同じ関数を使う
 */
export function firstPartySigningSecret(slug: FirstPartyAppSlug, env: NodeJS.ProcessEnv = process.env): string {
  const key = env['CALENDAR_TOKEN_ENCRYPTION_KEY']
  if (!key || key.length !== 64) throw new Error('CALENDAR_TOKEN_ENCRYPTION_KEY must be configured for first-party apps')
  return createHmac('sha256', Buffer.from(key, 'hex')).update(`cairn-first-party-app:${slug}:signing-secret`).digest('hex')
}

/** apps の行を作るか、今の定義に合わせる。戻り値は apps.id */
async function ensureFirstPartyApp(definition: FirstPartyAppDefinition): Promise<string> {
  const { db, apps } = await import('@cairn/db')
  const { and, eq, isNull, sql } = await import('drizzle-orm')
  const values = {
    name: definition.name,
    description: definition.description,
    requestUrl: definition.requestPath,
    signingSecretEncrypted: encryptToken(firstPartySigningSecret(definition.slug)),
    requestedScopes: [...APP_SCOPES],
    entryPoints: definition.entryPoints,
  }
  const [existing] = await db
    .select({ id: apps.id, requestUrl: apps.requestUrl, entryPoints: apps.entryPoints, name: apps.name })
    .from(apps)
    .where(and(eq(apps.slug, definition.slug), isNull(apps.ownerWorkspaceId)))
    .limit(1)
  if (existing) {
    // 定義が変わったときだけ書き換える（毎回の更新で updated_at を動かさない）
    if (existing.requestUrl !== values.requestUrl || existing.name !== values.name || JSON.stringify(existing.entryPoints) !== JSON.stringify(values.entryPoints)) {
      await db.update(apps).set({ ...values, updatedAt: sql`now()` }).where(eq(apps.id, existing.id))
    }
    return existing.id
  }
  const [created] = await db
    .insert(apps)
    .values({ slug: definition.slug, ...values })
    .onConflictDoNothing()
    .returning({ id: apps.id })
  if (created) return created.id
  // 同時に作られた場合は相手の行を使う
  const [raced] = await db.select({ id: apps.id }).from(apps).where(and(eq(apps.slug, definition.slug), isNull(apps.ownerWorkspaceId))).limit(1)
  if (!raced) throw new Error(`first-party app ${definition.slug} could not be created`)
  return raced.id
}

/**
 * ワークスペースにファーストパーティのアプリをすべてインストールする（冪等）。Bot profile と Bot トークンも作る。
 * 同時に呼ばれても Bot profile を余分に作らないよう、ワークスペース×アプリ単位のアドバイザリロックで直列化する
 */
export async function ensureFirstPartyInstallations(workspaceId: string): Promise<void> {
  const { db, appInstallations, appBotTokens, profiles } = await import('@cairn/db')
  const { and, eq, sql } = await import('drizzle-orm')
  for (const definition of FIRST_PARTY_APPS) {
    const appId = await ensureFirstPartyApp(definition)
    const [installed] = await db
      .select({ id: appInstallations.id })
      .from(appInstallations)
      .where(and(eq(appInstallations.appId, appId), eq(appInstallations.workspaceId, workspaceId)))
      .limit(1)
    if (installed) continue

    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`first-party-install:${workspaceId}:${appId}`}))`)
      const [again] = await tx
        .select({ id: appInstallations.id })
        .from(appInstallations)
        .where(and(eq(appInstallations.appId, appId), eq(appInstallations.workspaceId, workspaceId)))
        .limit(1)
      if (again) return
      const botProfileId = crypto.randomUUID()
      await tx.insert(profiles).values({ id: botProfileId, displayName: definition.name, kind: 'bot' })
      const [installation] = await tx
        .insert(appInstallations)
        .values({ appId, workspaceId, botProfileId, grantedScopes: [...APP_SCOPES] })
        .returning({ id: appInstallations.id })
      if (!installation) throw new Error('installation insert returned no rows')
      const token = createBotToken()
      // ファーストパーティは平文を控える人がいないため、暗号化した平文も持つ（§3.3）
      await tx.insert(appBotTokens).values({
        installationId: installation.id,
        tokenHash: token.hash,
        tokenPrefix: token.prefix,
        tokenEncrypted: encryptToken(token.token),
      })
    })
  }
}

/** ファーストパーティのアプリが Bot API を呼ぶためのトークン。インストールが欠けていれば作る */
export async function getFirstPartyBotToken(slug: FirstPartyAppSlug, workspaceId: string): Promise<string> {
  await ensureFirstPartyInstallations(workspaceId)
  const { db, apps, appInstallations, appBotTokens } = await import('@cairn/db')
  const { and, desc, eq, isNull, isNotNull } = await import('drizzle-orm')
  const [row] = await db
    .select({ tokenEncrypted: appBotTokens.tokenEncrypted })
    .from(appBotTokens)
    .innerJoin(appInstallations, eq(appInstallations.id, appBotTokens.installationId))
    .innerJoin(apps, eq(apps.id, appInstallations.appId))
    .where(
      and(
        eq(apps.slug, slug),
        isNull(apps.ownerWorkspaceId),
        eq(appInstallations.workspaceId, workspaceId),
        isNull(appInstallations.revokedAt),
        isNull(appBotTokens.revokedAt),
        isNotNull(appBotTokens.tokenEncrypted),
      ),
    )
    .orderBy(desc(appBotTokens.createdAt))
    .limit(1)
  if (!row?.tokenEncrypted) throw new Error(`first-party app ${slug} is not installed in workspace ${workspaceId}`)
  return decryptToken(row.tokenEncrypted)
}
