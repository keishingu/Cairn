// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from 'node:crypto'
import { BLOCKS_SCHEMA_VERSION, prepareModalView } from '@cairn/shared'
import type { BotContext } from '../bot-tokens'
import { consumeTrigger } from '../triggers'
import { fail, isUuid, stringArg, type WebApiArgs, type WebApiResult } from './types'

function newViewHash(): string {
  return `${Date.now()}.${randomBytes(8).toString('hex')}`
}

function parseViewArg(args: WebApiArgs): { ok: true; view: unknown } | { ok: false; result: WebApiResult } {
  const raw = args['view']
  if (raw === undefined || raw === '') return { ok: false, result: fail('invalid_arguments', { response_metadata: { messages: ['view が必要です'] } }) }
  if (typeof raw !== 'string') return { ok: true, view: raw }
  try {
    return { ok: true, view: JSON.parse(raw) }
  } catch {
    return { ok: false, result: fail('invalid_arguments', { response_metadata: { messages: ['view を JSON として読めません'] } }) }
  }
}

/** Slack の views.open / views.update と同じく、保存した view に id・hash などを付けて返す */
export function viewResult(bot: BotContext, row: { id: string; hash: string; view: unknown }) {
  return {
    ...(row.view as Record<string, unknown>),
    id: row.id,
    hash: row.hash,
    team_id: bot.workspaceId,
    app_id: bot.appId,
    bot_id: bot.installationId,
    state: { values: {} },
  }
}

export async function viewsOpen(bot: BotContext, args: WebApiArgs): Promise<WebApiResult> {
  const parsed = parseViewArg(args)
  if (!parsed.ok) return parsed.result
  const prepared = prepareModalView(parsed.view)
  if (!prepared.ok) return fail('invalid_arguments', { response_metadata: { messages: prepared.errors } })

  const { db, appViews } = await import('@cairn/db')
  // trigger_id の使用とモーダルの保存を1つのトランザクションにする（保存に失敗したら trigger_id は使っていないことになり、送り直せる）
  return db.transaction(async (tx) => {
    const trigger = await consumeTrigger(bot.installationId, stringArg(args, 'trigger_id'), tx)
    if (!trigger.ok) return fail(trigger.error)
    const [row] = await tx
      .insert(appViews)
      .values({
        installationId: bot.installationId,
        userId: trigger.userId,
        channelId: trigger.channelId,
        view: prepared.value,
        hash: newViewHash(),
        schemaVersion: BLOCKS_SCHEMA_VERSION,
      })
      .returning({ id: appViews.id, hash: appViews.hash, view: appViews.view })
    if (!row) throw new Error('Insert returned no rows')
    return { ok: true, view: viewResult(bot, row) } satisfies WebApiResult
  })
}

export async function viewsUpdate(bot: BotContext, args: WebApiArgs): Promise<WebApiResult> {
  const viewId = stringArg(args, 'view_id')
  if (!isUuid(viewId)) return fail('not_found')
  const parsed = parseViewArg(args)
  if (!parsed.ok) return parsed.result
  const prepared = prepareModalView(parsed.view)
  if (!prepared.ok) return fail('invalid_arguments', { response_metadata: { messages: prepared.errors } })

  const { db, appViews } = await import('@cairn/db')
  const { and, eq, isNull, lt, or, sql } = await import('drizzle-orm')
  const expectedHash = stringArg(args, 'hash')
  const [row] = await db
    .update(appViews)
    .set({ view: prepared.value, hash: newViewHash(), schemaVersion: BLOCKS_SCHEMA_VERSION, submissionInteractionId: null, updatedAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(appViews.id, viewId),
        eq(appViews.installationId, bot.installationId),
        eq(appViews.status, 'open'),
        // 利用者の送信をアプリへ届けている間（確保あり）は差し替えない。届ける送信の中身が古い版になってしまう。
        // 送信への応答で差し替えるときは response_action: update を使う（Slack と同じ）
        or(isNull(appViews.submittingUntil), lt(appViews.submittingUntil, sql`now()`)),
        // hash を指定したら、その版のままのときだけ差し替える（他の更新と競合したら hash_conflict）
        ...(expectedHash ? [eq(appViews.hash, expectedHash)] : []),
      ),
    )
    .returning({ id: appViews.id, hash: appViews.hash, view: appViews.view })
  if (row) return { ok: true, view: viewResult(bot, row) }

  const [existing] = await db
    .select({ id: appViews.id, submitting: sql<boolean>`${appViews.submittingUntil} is not null and ${appViews.submittingUntil} >= now()` })
    .from(appViews)
    .where(and(eq(appViews.id, viewId), eq(appViews.installationId, bot.installationId), eq(appViews.status, 'open')))
    .limit(1)
  if (existing?.submitting) return fail('view_is_submitting', { response_metadata: { messages: ['利用者の送信を処理している間は views.update できません。送信への応答で差し替えるときは response_action: update を返してください'] } })
  return fail(existing && expectedHash ? 'hash_conflict' : 'not_found')
}
