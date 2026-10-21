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

  const trigger = await consumeTrigger(bot.installationId, stringArg(args, 'trigger_id'))
  if (!trigger.ok) return fail(trigger.error)

  const { db, appViews } = await import('@cairn/db')
  const [row] = await db
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
  return { ok: true, view: viewResult(bot, row) }
}

export async function viewsUpdate(bot: BotContext, args: WebApiArgs): Promise<WebApiResult> {
  const viewId = stringArg(args, 'view_id')
  if (!isUuid(viewId)) return fail('not_found')
  const parsed = parseViewArg(args)
  if (!parsed.ok) return parsed.result
  const prepared = prepareModalView(parsed.view)
  if (!prepared.ok) return fail('invalid_arguments', { response_metadata: { messages: prepared.errors } })

  const { db, appViews } = await import('@cairn/db')
  const { and, eq, sql } = await import('drizzle-orm')
  const expectedHash = stringArg(args, 'hash')
  const [row] = await db
    .update(appViews)
    .set({ view: prepared.value, hash: newViewHash(), schemaVersion: BLOCKS_SCHEMA_VERSION, updatedAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(appViews.id, viewId),
        eq(appViews.installationId, bot.installationId),
        eq(appViews.status, 'open'),
        // hash を指定したら、その版のままのときだけ差し替える（他の更新と競合したら hash_conflict）
        ...(expectedHash ? [eq(appViews.hash, expectedHash)] : []),
      ),
    )
    .returning({ id: appViews.id, hash: appViews.hash, view: appViews.view })
  if (row) return { ok: true, view: viewResult(bot, row) }

  const [existing] = await db
    .select({ id: appViews.id })
    .from(appViews)
    .where(and(eq(appViews.id, viewId), eq(appViews.installationId, bot.installationId), eq(appViews.status, 'open')))
    .limit(1)
  return fail(existing && expectedHash ? 'hash_conflict' : 'not_found')
}
