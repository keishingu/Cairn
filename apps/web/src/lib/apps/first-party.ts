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

/**
 * apps の定義を書き換えてよいデプロイか。Preview（PR）と develop は同じ DB を共有するため、PR の Preview が
 * 古い・新しい定義で共有の行を書き換え合うと、起動口や Request URL が版の間で揺れる。行を同期するのは
 * 本番・develop・Vercel 以外（ローカル）だけにし、PR の Preview は行が無いときに作るだけにする
 */
export function canSyncFirstPartyDefinitions(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env['VERCEL_ENV']) return true
  return env['VERCEL_ENV'] === 'production' || env['VERCEL_GIT_COMMIT_REF'] === 'develop'
}

/** 今の鍵で復号して期待した値になるか。復号できない（鍵の入れ替え後など）も false */
function decryptsTo(encrypted: string | null, expected: string): boolean {
  if (!encrypted) return false
  try {
    return decryptToken(encrypted) === expected
  } catch {
    return false
  }
}

/**
 * このデプロイのコードでのアプリの Request URL と起動口。ファーストパーティは DB の行ではなく、このデプロイの定義を使う
 * （DB を共有する PR の Preview と develop で版が違っても、自分の持っている経路だけを出し、そこへ送る）。
 * このデプロイが知らないファーストパーティのアプリは null（起動口を出さず、配送もしない）
 */
export function forThisDeployment<T extends { slug: string | null; ownerWorkspaceId: string | null; requestUrl: string | null; entryPoints?: unknown }>(
  app: T,
): (T & { requestUrl: string | null; entryPoints: unknown }) | null {
  if (app.ownerWorkspaceId !== null || !app.slug) return { ...app, entryPoints: app.entryPoints }
  const definition = FIRST_PARTY_APPS.find((candidate) => candidate.slug === app.slug)
  if (!definition) return null
  return { ...app, requestUrl: definition.requestPath, entryPoints: definition.entryPoints }
}

/**
 * 配送に使う署名シークレット。ファーストパーティ（Request URL がパス）は暗号鍵から毎回導くので、
 * 鍵を入れ替えた直後で保存値がまだ古い鍵の暗号文でも配送できる。外部アプリは保存値を復号する
 */
export function resolveSigningSecret(stored: { requestUrl: string; signingSecretEncrypted: string }): string {
  const firstParty = FIRST_PARTY_APPS.find((definition) => definition.requestPath === stored.requestUrl)
  return firstParty ? firstPartySigningSecret(firstParty.slug) : decryptToken(stored.signingSecretEncrypted)
}

/** apps の行を作るか、今の定義に合わせる。戻り値は apps.id */
async function ensureFirstPartyApp(definition: FirstPartyAppDefinition): Promise<string | null> {
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
    .select({
      id: apps.id,
      requestUrl: apps.requestUrl,
      entryPoints: apps.entryPoints,
      name: apps.name,
      description: apps.description,
      requestedScopes: apps.requestedScopes,
      signingSecretEncrypted: apps.signingSecretEncrypted,
    })
    .from(apps)
    .where(and(eq(apps.slug, definition.slug), isNull(apps.ownerWorkspaceId)))
    .limit(1)
  if (existing) {
    // 定義が変わったときだけ書き換える（毎回の更新で updated_at を動かさない）
    // 暗号鍵を入れ替えた後は、保存済みの署名シークレットが今の鍵で復号できない（または導いた値と違う）ので書き直す
    const secretStale = decryptsTo(existing.signingSecretEncrypted, firstPartySigningSecret(definition.slug)) === false
    // 書き込む項目はすべて比べる（説明やスコープだけを変えた版でも同期されるように）
    const changed =
      secretStale ||
      existing.requestUrl !== values.requestUrl ||
      existing.name !== values.name ||
      existing.description !== values.description ||
      JSON.stringify(existing.requestedScopes) !== JSON.stringify(values.requestedScopes) ||
      JSON.stringify(existing.entryPoints) !== JSON.stringify(values.entryPoints)
    if (changed && canSyncFirstPartyDefinitions()) {
      await db.update(apps).set({ ...values, updatedAt: sql`now()` }).where(eq(apps.id, existing.id))
    }
    return existing.id
  }
  // 共有の行を新しく作るのも本番・develop・ローカルだけ。PR の Preview が作ると、その経路を持たない develop にも起動口が出てしまう
  if (!canSyncFirstPartyDefinitions()) return null
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
    // まだ develop などで作られていないアプリは、PR の Preview ではインストールしない（使おうとすると未インストールのエラーになる）
    if (!appId) continue
    const [installed] = await db
      .select({ id: appInstallations.id, botProfileId: appInstallations.botProfileId, botName: profiles.displayName, grantedScopes: appInstallations.grantedScopes })
      .from(appInstallations)
      .innerJoin(profiles, eq(profiles.id, appInstallations.botProfileId))
      .where(and(eq(appInstallations.appId, appId), eq(appInstallations.workspaceId, workspaceId)))
      .limit(1)
    if (installed) {
      // アプリ名を変えた版では Bot profile の名前も合わせる（auth.test や引用の送信者名と、起動口・発言のアプリ名をずらさない）。
      // 定義の同期と同じく、書き換えるのは本番・develop・ローカルだけ
      if (installed.botName !== definition.name && canSyncFirstPartyDefinitions()) {
        await db.update(profiles).set({ displayName: definition.name }).where(eq(profiles.id, installed.botProfileId))
      }
      // 必要なスコープを足した版では、既存のインストールの許可も合わせる（古い許可のままだと Bot API が missing_scope になる）
      if (JSON.stringify([...installed.grantedScopes].sort()) !== JSON.stringify([...APP_SCOPES].sort()) && canSyncFirstPartyDefinitions()) {
        await db.update(appInstallations).set({ grantedScopes: [...APP_SCOPES] }).where(eq(appInstallations.id, installed.id))
      }
      continue
    }

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
  const { and, desc, eq, isNull, isNotNull, sql } = await import('drizzle-orm')
  const rows = await db
    .select({ id: appBotTokens.id, installationId: appBotTokens.installationId, tokenEncrypted: appBotTokens.tokenEncrypted, createdAt: appBotTokens.createdAt })
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
  const installationId = rows[0]?.installationId
  if (!installationId) throw new Error(`first-party app ${slug} is not installed in workspace ${workspaceId}`)
  // 復号できないのは「このデプロイの鍵では読めない」だけで、別の鍵のデプロイ（DB を共有する Preview など）が使っているかもしれない。
  // すぐには取り消さず、今の鍵で読める有効なトークンを探し、無ければ今の鍵で読めるものを足す
  const readable = firstReadableToken(rows)
  if (readable) {
    await revokeRetiredTokens(rows, readable.index)
    return readable.token
  }

  return db.transaction(async (tx) => {
    // 同時に足さないよう、インストールごとに直列化してから読み直す
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`first-party-bot-token:${installationId}`}))`)
    const again = await tx
      .select({ tokenEncrypted: appBotTokens.tokenEncrypted, createdAt: appBotTokens.createdAt, id: appBotTokens.id })
      .from(appBotTokens)
      .where(and(eq(appBotTokens.installationId, installationId), isNull(appBotTokens.revokedAt), isNotNull(appBotTokens.tokenEncrypted)))
      .orderBy(desc(appBotTokens.createdAt))
    const readableNow = firstReadableToken(again)
    if (readableNow) return readableNow.token

    console.warn(`[first-party] no bot token for ${slug} is readable with the current key; issuing one`)
    const token = createBotToken()
    await tx.insert(appBotTokens).values({
      installationId,
      tokenHash: token.hash,
      tokenPrefix: token.prefix,
      tokenEncrypted: encryptToken(token.token),
    })
    return token.token
  })
}

/**
 * 古い鍵で暗号化されたトークンを取り消すまでの猶予。猶予は「今の鍵で読めるトークンができてから」数える
 * （古いトークン自体の作成日時から数えると、鍵を入れ替えた直後に取り消されて、古い鍵のデプロイが急に 401 になる）
 */
const UNREADABLE_TOKEN_GRACE_MS = 7 * 24 * 60 * 60 * 1000

function firstReadableToken(rows: Array<{ tokenEncrypted: string | null }>): { token: string; index: number } | null {
  for (const [index, row] of rows.entries()) {
    if (!row.tokenEncrypted) continue
    try {
      return { token: decryptToken(row.tokenEncrypted), index }
    } catch {
      // 別の鍵で暗号化されたトークン。次を試す
    }
  }
  return null
}

/**
 * 退役した鍵のトークンを有効なまま残し続けない。今の鍵で読めるトークンができてから猶予が過ぎていれば、
 * それより前に作られた読めないトークンを取り消す。猶予の間は、古い鍵で動いている別のデプロイがまだ使えるようにしておく
 */
async function revokeRetiredTokens(rows: Array<{ id: string; tokenEncrypted: string | null; createdAt: Date }>, readableIndex: number): Promise<void> {
  const current = rows[readableIndex]
  if (!current || current.createdAt.getTime() > Date.now() - UNREADABLE_TOKEN_GRACE_MS) return
  // 退役とみなすのは、今の鍵のトークンより前に作られた読めないトークン（鍵を入れ替える前のもの）だけ。
  // 今の鍵のトークンより後に作られた読めないトークンは、別の鍵で動いている別のデプロイが今使っているものなので残す
  const retired = rows
    .filter((row, index) => index !== readableIndex && row.createdAt.getTime() < current.createdAt.getTime() && !isReadable(row.tokenEncrypted))
    .map((row) => row.id)
  if (retired.length === 0) return
  const { db, appBotTokens } = await import('@cairn/db')
  const { inArray } = await import('drizzle-orm')
  await db.update(appBotTokens).set({ revokedAt: new Date() }).where(inArray(appBotTokens.id, retired))
}

function isReadable(encrypted: string | null): boolean {
  if (!encrypted) return false
  try {
    decryptToken(encrypted)
    return true
  } catch {
    return false
  }
}
