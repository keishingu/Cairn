// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from 'node:crypto'
import { isAppLocale, translate, type AppLocale } from '@cairn/shared'
import { getFirstPartyInstallationId } from '@/lib/apps/first-party'
import { inngest } from '@/lib/inngest/client'
import { callBotApi, PollsBotApiError } from './bot-client'
import { POLL_OPTION_LIMITS, renderPollCard, type PollForRender } from './render'
import { pollInputErrors, pollOptionLabelError } from './validate'

export const POLL_RENDER_EVENT = 'polls/card.render'
/** 締切に締める遅延実行（polls-card-close）を起こすイベント。投稿できた時点で1回送る */
export const POLL_CLOSE_EVENT = 'polls/card.close'

// 投票の作成・投稿・カードの再描画。外部 HTTP（Bot API）はトランザクションの外で呼び、
// DB の状態（status・version・rendered_version）から再試行が同じ結果に収束するようにする（docs/app-platform-design.md §7.3・§7.4）

export type CreatePollInput = {
  workspaceId: string
  channelId: string
  question: string
  options: string[]
  allowMultiple: boolean
  /** カードを描く言語（作成者の表示言語）。入力の誤りもこの言語で返す */
  locale: AppLocale
  /** 呼び出し元ごとに一意（定期ジョブは run の ID、モーダルは view の ID）。再試行は既存の投票を返す */
  idempotencyKey: string
} & (
  | { createdBy: string; /** 締切。投稿時に予約した遅延実行（polls-card-close）が締め、カードを描き直す */ closesAt?: Date | null }
  // 作成者のいない投票（定期ジョブ・AI）は誰も締め切りを押せないので、締切を必須にする（無いと票を受け付け続ける）
  | { createdBy: null; closesAt: Date }
)

async function loadPoll(pollId: string) {
  const { db, polls, pollOptions, pollVotes } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const [poll] = await db.select().from(polls).where(eq(polls.id, pollId)).limit(1)
  if (!poll) return null
  const [options, votes] = await Promise.all([
    db.select({ id: pollOptions.id, label: pollOptions.label, position: pollOptions.position }).from(pollOptions).where(eq(pollOptions.pollId, pollId)),
    db.select({ optionId: pollVotes.optionId, userId: pollVotes.userId }).from(pollVotes).where(eq(pollVotes.pollId, pollId)),
  ])
  const forRender: PollForRender = {
    id: poll.id,
    question: poll.question,
    allowMultiple: poll.allowMultiple,
    locale: storedLocale(poll),
    closesAt: poll.closesAt,
    status: poll.status as PollForRender['status'],
    options,
    votes,
  }
  return { poll, forRender }
}

function storedLocale(poll: { id: string; locale: string }): AppLocale {
  // DB の check で保証しているが、列の値を型として信じる前に確かめる
  if (!isAppLocale(poll.locale)) throw new Error(`poll ${poll.id} has unknown locale ${poll.locale}`)
  return poll.locale
}

async function workspaceOfInstallation(installationId: string): Promise<string> {
  const { db, appInstallations } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const [row] = await db.select({ workspaceId: appInstallations.workspaceId }).from(appInstallations).where(eq(appInstallations.id, installationId)).limit(1)
  if (!row) throw new Error(`installation ${installationId} not found`)
  return row.workspaceId
}

/**
 * 投票を投稿待ち（pending_post）で作る。同じ冪等キーの再試行は既存の投票を返す。
 * sameInput は既存の投票が今回の入力と同じか（応答が届かず内容を直して送り直した場合に、古い内容で黙って閉じないため）
 */
export async function createPendingPoll(input: CreatePollInput): Promise<{ pollId: string; sameInput: boolean }> {
  const { db, polls, pollOptions } = await import('@cairn/db')
  const { and, asc, eq } = await import('drizzle-orm')
  // 型で必須にしているが、JS や any 経由の呼び出しでも締められない投票を作らない
  if (input.createdBy === null && !input.closesAt) throw new Error('a poll without a creator requires closesAt')
  const installationId = await getFirstPartyInstallationId('polls', input.workspaceId)

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(polls)
      .values({
        installationId,
        channelId: input.channelId,
        createdBy: input.createdBy,
        question: input.question,
        allowMultiple: input.allowMultiple,
        locale: input.locale,
        closesAt: input.closesAt ?? null,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({ target: [polls.installationId, polls.idempotencyKey] })
      .returning({ id: polls.id })
    if (!created) {
      const [existing] = await tx
        .select({ id: polls.id, question: polls.question, allowMultiple: polls.allowMultiple, channelId: polls.channelId, createdBy: polls.createdBy, closesAt: polls.closesAt })
        .from(polls)
        .where(and(eq(polls.installationId, installationId), eq(polls.idempotencyKey, input.idempotencyKey)))
        .limit(1)
      if (!existing) throw new Error('poll idempotency conflict without a row')
      const options = await tx.select({ label: pollOptions.label }).from(pollOptions).where(eq(pollOptions.pollId, existing.id)).orderBy(asc(pollOptions.position))
      // 保存する項目はすべて比べる（チャンネル・作成者・締切が違う呼び出しに、前の投票を黙って返さない）。
      // 言語は表示だけなので比べない（送り直す間に表示言語を変えても、作成済みの投票は同じ）
      const sameInput =
        existing.channelId === input.channelId &&
        existing.createdBy === input.createdBy &&
        (existing.closesAt?.getTime() ?? null) === (input.closesAt?.getTime() ?? null) &&
        existing.question === input.question &&
        existing.allowMultiple === input.allowMultiple &&
        options.length === input.options.length &&
        options.every((option, index) => option.label === input.options[index])
      return { pollId: existing.id, sameInput }
    }
    await tx.insert(pollOptions).values(input.options.map((label, position) => ({ pollId: created.id, label, position })))
    return { pollId: created.id, sameInput: true }
  })
}

/** 投票を作り、カードを投稿する。同じ冪等キーの再試行は同じ投票・同じメッセージに収束する */
export async function createPoll(input: CreatePollInput): Promise<{ pollId: string; messageId: string }> {
  // 定期ジョブ・AI からの作成もモーダルと同じ規則で、作る前に確かめる（作った後に投稿だけが失敗すると、同じ冪等キーでは作り直せない）
  const inputErrors = pollInputErrors(input.question, input.options, input.locale)
  if (inputErrors) throw new Error(`invalid poll input: ${Object.values(inputErrors).join(' / ')}`)
  const { pollId, sameInput } = await createPendingPoll(input)
  // 同じ冪等キーで内容が違う呼び出しは、前の投票を黙って返さない
  if (!sameInput) throw new Error(`poll ${pollId} already exists for this idempotency key with different content`)
  const messageId = await postPoll(pollId)
  // 定期ジョブ・AI からの作成では、投稿できなかったことを呼び出し元にエラーとして返す
  if (!messageId) throw new Error(`poll ${pollId} could not be posted`)
  return { pollId, messageId }
}

/**
 * 再試行しても通らない投稿の失敗（チャンネルが消えた・内容の拒否など）。
 * モーダルを閉じた後に起きるので、投稿待ちのまま拾い直し続けず post_failed として止める
 */
const PERMANENT_POST_ERRORS = new Set(['channel_not_found', 'method_not_supported_for_channel_type', 'invalid_blocks', 'invalid_arguments', 'msg_too_long', 'no_text', 'client_msg_id_conflict'])
/** 元に戻り得る投稿の失敗（アーカイブの解除・アプリの再追加）。投稿待ちのまま残し、拾い直しの間隔だけ空ける */
const REVERSIBLE_POST_ERRORS = new Set(['is_archived', 'not_in_channel'])

/**
 * 投稿待ちの投票を投稿する。client_msg_id を事前に採番しているので、途中で失敗しても再試行で二重に投稿されない。
 * 再試行しても通らない理由で失敗したら post_failed にし、元に戻り得る理由なら投稿待ちのまま、どちらも null を返す
 */
export async function postPoll(pollId: string): Promise<string | null> {
  const loaded = await loadPoll(pollId)
  if (!loaded) throw new Error(`poll ${pollId} not found`)
  const { poll, forRender } = loaded
  if (poll.messageId) return poll.messageId
  if (poll.status === 'post_failed') return null

  const { db, polls } = await import('@cairn/db')
  const { and, eq, sql } = await import('drizzle-orm')
  const workspaceId = await workspaceOfInstallation(poll.installationId)
  let status = forRender.status
  if (status === 'pending_post' && poll.closesAt && poll.closesAt.getTime() <= Date.now()) {
    // 投稿できないまま締切を過ぎた（アーカイブ中など）。締切の処理は投稿済みの投票だけを締めるので、開いたカードで投稿して
    // 押せるのに票が入らないボタンを出さないよう、ここで締めてから締め切り済みのカードを投稿する
    await db
      .update(polls)
      .set({ status: 'closed', closedAt: sql`now()`, version: sql`${polls.version} + 1`, updatedAt: sql`now()` })
      .where(and(eq(polls.id, pollId), eq(polls.status, 'pending_post')))
    status = 'closed'
  }
  const card = renderPollCard({ ...forRender, status: status === 'pending_post' ? 'posted' : status })
  let result: { ts: string }
  try {
    result = await callBotApi<{ ts: string }>(workspaceId, 'chat.postMessage', {
      channel: poll.channelId,
      text: card.text,
      blocks: card.blocks,
      client_msg_id: poll.clientMsgId,
    })
  } catch (err) {
    if (!(err instanceof PollsBotApiError)) throw err
    if (REVERSIBLE_POST_ERRORS.has(err.code)) {
      // アーカイブの解除やアプリの再追加で投稿できるようになったら投稿する。毎時の拾い直しが拾い続けないよう間隔を空ける
      console.warn(`[polls] poll ${pollId} cannot be posted now (${err.code}); retrying after ${REVERSIBLE_RETRY_INTERVAL}`)
      await db.update(polls).set({ postError: err.code, updatedAt: sql`now() + ${REVERSIBLE_RETRY_INTERVAL}::interval` }).where(eq(polls.id, pollId))
      return null
    }
    if (!PERMANENT_POST_ERRORS.has(err.code)) throw err
    console.error(`[polls] poll ${pollId} could not be posted (${err.code}); giving up`)
    await db.update(polls).set({ status: 'post_failed', postError: err.code, updatedAt: sql`now()` }).where(eq(polls.id, pollId))
    return null
  }

  await db
    .update(polls)
    .set({
      messageId: result.ts,
      status: sql`case when ${polls.status} = 'pending_post' then 'posted' else ${polls.status} end`,
      // 描いたと記録するのは作成時の版（0）まで。前回の投稿が成功していた（message_id の保存だけ失敗した）場合、
      // client_msg_id の冪等化で返るのは前回のカードで、その後の投票は描かれていない。今の版を描いたことにすると描き直されなくなる
      renderedVersion: sql`greatest(${polls.renderedVersion}, 0)`,
      updatedAt: sql`now()`,
    })
    .where(eq(polls.id, pollId))
  if (status !== 'closed' && poll.closesAt) await scheduleClose(pollId, poll.closesAt)
  return result.ts
}

/**
 * 締切に締める遅延実行を予約する。締切を待つ間は Inngest の実行数を使わないので、投票のために cron を回し続けずに済む。
 * 投稿の再試行で何度呼ばれても、イベント ID で1本にまとまる。送れなくても投稿は済んでいるので失敗にはせず、
 * 毎時の拾い直し（sweepStalePolls）が締める（締めが最大1時間遅れる）
 */
async function scheduleClose(pollId: string, closesAt: Date): Promise<void> {
  try {
    await inngest.send({ id: `poll-close-${pollId}`, name: POLL_CLOSE_EVENT, data: { pollId } })
  } catch (err) {
    console.error(`[polls] could not schedule closing poll ${pollId} at ${closesAt.toISOString()}; the hourly sweep will close it:`, err)
  }
}

/**
 * カードを今の集計で描き直す。読んだ時点の version を描き、描いた版を rendered_version に記録する。
 * 投票ごとに1本ずつ実行される（Inngest の concurrency）ので、同時投票で古い集計が後勝ちしない
 */
/** 二度と書き換えられないカードの失敗（メッセージ・チャンネルが消えたなど）。この版で描き直しをやめる */
const PERMANENT_UPDATE_ERRORS = new Set(['channel_not_found', 'message_not_found', 'cant_update_message', 'method_not_supported_for_channel_type'])
/** 元に戻り得る失敗（アーカイブの解除・アプリの再追加）。描画待ちのまま残し、拾い直しの間隔だけ空ける */
const REVERSIBLE_UPDATE_ERRORS = new Set(['is_archived', 'not_in_channel'])
const REVERSIBLE_RETRY_INTERVAL = '1 day'

export async function renderPoll(pollId: string): Promise<'posted' | 'updated' | 'skipped' | 'post_failed_or_deferred' | 'update_abandoned' | 'update_deferred'> {
  const loaded = await loadPoll(pollId)
  if (!loaded) return 'skipped'
  const { poll, forRender } = loaded
  if (!poll.messageId) {
    if ((await postPoll(pollId)) === null) return 'post_failed_or_deferred'
    // 投稿した（または前回の投稿を取り戻した）カードより新しい票があれば、続けて描き直す
    const after = await renderPoll(pollId)
    return after === 'skipped' ? 'posted' : after
  }
  if (poll.version <= poll.renderedVersion) return 'skipped'

  const workspaceId = await workspaceOfInstallation(poll.installationId)
  const card = renderPollCard(forRender)
  const { db, polls } = await import('@cairn/db')
  const { eq, sql } = await import('drizzle-orm')
  try {
    await callBotApi(workspaceId, 'chat.update', { channel: poll.channelId, ts: poll.messageId, blocks: card.blocks })
  } catch (err) {
    if (!(err instanceof PollsBotApiError)) throw err
    if (REVERSIBLE_UPDATE_ERRORS.has(err.code)) {
      // アーカイブの解除などで書き換えられるようになったら、締切や票を描けるよう描画待ちのまま残す。
      // 毎時の拾い直しが拾い続けないよう、次に拾うまでの間隔を空ける（updated_at を先にずらす）
      console.warn(`[polls] card of poll ${pollId} cannot be updated now (${err.code}); retrying after ${REVERSIBLE_RETRY_INTERVAL}`)
      await db
        .update(polls)
        .set({ updatedAt: sql`now() + ${REVERSIBLE_RETRY_INTERVAL}::interval` })
        .where(eq(polls.id, pollId))
      return 'update_deferred'
    }
    if (!PERMANENT_UPDATE_ERRORS.has(err.code)) throw err
    // カードはもう書き換えられない（メッセージが消えたなど）。描画待ちのまま cron が拾い直し続けないよう、この版で描き直しをやめる
    console.error(`[polls] card of poll ${pollId} can no longer be updated (${err.code}); giving up re-rendering`)
    await db
      .update(polls)
      .set({ renderedVersion: sql`greatest(${polls.renderedVersion}, ${poll.version})`, updatedAt: sql`now()` })
      .where(eq(polls.id, pollId))
    return 'update_abandoned'
  }

  await db
    .update(polls)
    .set({ renderedVersion: sql`greatest(${polls.renderedVersion}, ${poll.version})`, updatedAt: sql`now()` })
    .where(eq(polls.id, pollId))
  return 'updated'
}

/** リースの長さ。投稿（chat.postMessage）と描き直し（chat.update）がそれぞれ Bot API の時間切れ（10秒）まで掛かっても切れない長さにする */
const RENDER_LEASE_SECONDS = 60
/** 描いている間に票が入り続けても、1本の処理が描き続けて終わらないことがないよう、続けて描く回数の上限 */
const MAX_RENDER_ROUNDS = 10

type RenderResult = Awaited<ReturnType<typeof renderPoll>>
/** 描き直しが進まない結果。リースを持ったまま描き直しても同じ結果になるので、版が進んでいても続けない */
const STALLED_RESULTS = new Set<RenderResult>(['post_failed_or_deferred', 'update_deferred'])

/**
 * 投票ごとに1本だけカードを描く。応答後のその場の描画と Inngest の拾い直しの両方がこれを通る。
 * - 他の処理が描いていれば 'busy'。描いている側がリースを返す前に版の進みを確かめて描き直すので、この票も描かれる
 * - 'incomplete' は上限まで描き直しても票が入り続けた場合。呼び出し元が Inngest に描き直しを任せる
 * リースの解放は「描いた版が最新」のときだけ成功する（1つの UPDATE で確かめる）ので、
 * 票の commit とリースの解放がどの順で起きても、どちらかが必ず最新の版を描く
 */
export async function renderPollExclusively(pollId: string): Promise<RenderResult | 'busy' | 'incomplete'> {
  const { db, polls } = await import('@cairn/db')
  const { and, eq, isNull, lt, or, sql } = await import('drizzle-orm')
  const token = randomUUID()
  const leaseUntil = sql`now() + ${`${RENDER_LEASE_SECONDS} seconds`}::interval`
  const ours = and(eq(polls.id, pollId), eq(polls.renderLeaseToken, token))
  const release = (condition?: ReturnType<typeof sql>) =>
    db
      .update(polls)
      .set({ renderLeaseToken: null, renderLeaseUntil: null })
      .where(condition ? and(ours, condition) : ours)
      .returning({ id: polls.id })

  // updated_at は動かさない（cron が拾う順と、元に戻り得る失敗で空けた間隔を崩さない）
  const acquired = await db
    .update(polls)
    .set({ renderLeaseToken: token, renderLeaseUntil: leaseUntil })
    .where(and(eq(polls.id, pollId), or(isNull(polls.renderLeaseUntil), lt(polls.renderLeaseUntil, sql`now()`))))
    .returning({ id: polls.id })
  if (acquired.length === 0) {
    const [exists] = await db.select({ id: polls.id }).from(polls).where(eq(polls.id, pollId)).limit(1)
    return exists ? 'busy' : 'skipped'
  }

  try {
    for (let round = 0; round < MAX_RENDER_ROUNDS; round++) {
      const result = await renderPoll(pollId)
      if (STALLED_RESULTS.has(result)) {
        await release()
        return result
      }
      // 描いている間に新しい票が commit されていなければ、ここで返して終わる
      const released = await release(sql`${polls.version} <= ${polls.renderedVersion} and ${polls.messageId} is not null`)
      if (released.length > 0) return result
      // 新しい票がある。リースを延ばして描き直す（延ばせなければ、リースが切れて他の処理が描いている）
      const extended = await db.update(polls).set({ renderLeaseUntil: leaseUntil }).where(ours).returning({ id: polls.id })
      if (extended.length === 0) return result
    }
    await release()
    return 'incomplete'
  } catch (err) {
    // 失敗したら次の処理（Inngest の再試行・cron の拾い直し）がすぐ描けるよう、リースを返す
    await release().catch((releaseErr: unknown) => console.error(`[polls] failed to release render lease of poll ${pollId}:`, releaseErr))
    throw err
  }
}

/**
 * 作った後で選択肢を1つ足す（入れ忘れの補完）。足せるのは作成者だけで、締め切り後・上限に達した後は足せない。
 * 足したら版を進め、呼び出し元がカードを描き直す。足せなければ利用者に見せる理由を返す。
 * submissionId（モーダルの view ID）を足すのと同じトランザクションで記録し、応答が失われて同じ送信が再送されても、
 * 二重に足したり「同じ選択肢がすでにあります」と断ったりせず成功として返す
 */
export async function addPollOption(input: { pollId: string; workspaceId: string; userId: string; label: string; locale: AppLocale; submissionId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = (message: string, values?: Record<string, string | number>) => translate(input.locale, message, values)
  const labelError = pollOptionLabelError(input.label, input.locale)
  if (labelError) return { ok: false, error: labelError }

  const { db, polls, pollOptions, pollProcessedInteractions, appInstallations } = await import('@cairn/db')
  const { eq, sql } = await import('drizzle-orm')
  return db.transaction(async (tx) => {
    // 票の受付と同じく投票ごとに直列化し、同時に足しても position・上限がずれないようにする
    const [poll] = await tx
      .select({
        createdBy: polls.createdBy,
        status: polls.status,
        workspaceId: appInstallations.workspaceId,
        pastDeadline: sql<boolean>`coalesce(${polls.closesAt} <= now(), false)`,
      })
      .from(polls)
      .innerJoin(appInstallations, eq(appInstallations.id, polls.installationId))
      .where(eq(polls.id, input.pollId))
      .for('update', { of: polls })
    // 別ワークスペースの投票は存在しないものとして扱う
    if (!poll || poll.workspaceId !== input.workspaceId) return { ok: false as const, error: t('This poll no longer exists') }
    if (poll.createdBy !== input.userId) return { ok: false as const, error: t('Only the person who created the poll can add options.') }
    // 同じ送信の再送。前の送信で足し終えているので、今の状態（重複・上限・締切）で断らず成功として閉じる
    const [processed] = await tx
      .select({ id: pollProcessedInteractions.interactionId })
      .from(pollProcessedInteractions)
      .where(eq(pollProcessedInteractions.interactionId, input.submissionId))
      .limit(1)
    if (processed) return { ok: true as const }
    if (poll.status === 'closed' || poll.status === 'post_failed' || poll.pastDeadline) return { ok: false as const, error: t('This poll is closed') }

    const existing = await tx.select({ label: pollOptions.label, position: pollOptions.position }).from(pollOptions).where(eq(pollOptions.pollId, input.pollId))
    if (existing.length >= POLL_OPTION_LIMITS.max) return { ok: false as const, error: t('You can add up to {max} options', { max: POLL_OPTION_LIMITS.max }) }
    if (existing.some((option) => option.label === input.label)) return { ok: false as const, error: t('This option already exists') }

    const position = Math.max(-1, ...existing.map((option) => option.position)) + 1
    await tx.insert(pollOptions).values({ pollId: input.pollId, label: input.label, position })
    await tx.insert(pollProcessedInteractions).values({ interactionId: input.submissionId, pollId: input.pollId })
    await tx.update(polls).set({ version: sql`${polls.version} + 1`, updatedAt: sql`now()` }).where(eq(polls.id, input.pollId))
    return { ok: true as const }
  })
}

/**
 * アプリを取り外した（インストールを取り消した）ワークスペースの投票は、Bot トークンが取れず投稿も描き直しも必ず失敗する。
 * 締めや拾い直しの対象から外し、失敗し続ける投票で毎回の拾い直しを埋めない（再インストールで取り消しが外れれば、また拾われる）
 */
async function activeInstallationFilter() {
  const { db, appInstallations, polls } = await import('@cairn/db')
  const { inArray, isNull } = await import('drizzle-orm')
  return inArray(polls.installationId, db.select({ id: appInstallations.id }).from(appInstallations).where(isNull(appInstallations.revokedAt)))
}

/**
 * 締切を過ぎた投稿済みの投票を締め、締めた投票の ID を返す。版を進めるので描き直しの対象になる（冪等）。
 * pollId を渡すとその投票だけを締める（締切の遅延実行）。updated_at を1分戻し、拾い直しがすぐ拾えるようにする
 */
export async function closeDuePolls(pollId?: string): Promise<string[]> {
  const { db, polls } = await import('@cairn/db')
  const { and, eq, isNotNull, lte, sql } = await import('drizzle-orm')
  const activeInstallation = await activeInstallationFilter()
  const rows = await db
    .update(polls)
    .set({ status: 'closed', closedAt: sql`now()`, version: sql`${polls.version} + 1`, updatedAt: sql`now() - interval '1 minute'` })
    .where(and(eq(polls.status, 'posted'), isNotNull(polls.closesAt), lte(polls.closesAt, sql`now()`), activeInstallation, pollId ? eq(polls.id, pollId) : undefined))
    .returning({ id: polls.id })
  return rows.map((row) => row.id)
}

/** 締切の遅延実行が次に起きる時刻。締めなくてよい（締め済み・投稿できていない・締切なし）なら null、締切を過ぎていれば 'due' */
export async function nextCloseCheck(pollId: string, maxWaitMs: number): Promise<string | 'due' | null> {
  const { db, polls } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const [poll] = await db.select({ status: polls.status, closesAt: polls.closesAt }).from(polls).where(eq(polls.id, pollId)).limit(1)
  if (!poll || poll.status !== 'posted' || !poll.closesAt) return null
  const now = Date.now()
  if (poll.closesAt.getTime() <= now) return 'due'
  // 1回に眠れる長さには上限があるので、締切が遠ければ途中で起きて眠り直す
  return new Date(Math.min(poll.closesAt.getTime(), now + maxWaitMs)).toISOString()
}

/**
 * 通常経路の取りこぼしを拾い直す（毎時の定期処理から呼ぶ。docs/app-platform-design.md §7.3）。
 * - 締切の予約を送れなかった投票を締める
 * - commit 後にイベントを送る前に止まった・投稿の途中で失敗した投票へ、描き直しのイベントを送り直す
 * - 30日より古い処理済みインタラクションを消す
 */
export async function sweepStalePolls(): Promise<{ closed: number; requeued: number }> {
  const closed = await closeDuePolls()
  const { db, polls, pollProcessedInteractions } = await import('@cairn/db')
  const { and, asc, inArray, lt, or, sql } = await import('drizzle-orm')
  const activeInstallation = await activeInstallationFilter()
  await db.delete(pollProcessedInteractions).where(lt(pollProcessedInteractions.createdAt, sql`now() - interval '30 days'`))
  // 古いものから拾い、拾った投票は updated_at を進めて列の後ろへ回す。投稿し続けて失敗する投票があっても、
  // 同じ投票ばかりを毎回拾って、イベントを失っただけの投票が拾われないままにならない
  const stale = db
    .select({ id: polls.id })
    .from(polls)
    .where(
      and(
        or(sql`${polls.version} > ${polls.renderedVersion}`, sql`${polls.status} = 'pending_post'`),
        sql`${polls.status} <> 'post_failed'`,
        lt(polls.updatedAt, sql`now() - interval '1 minute'`),
        activeInstallation,
      ),
    )
    .orderBy(asc(polls.updatedAt))
    .limit(200)
  const rows = await db.update(polls).set({ updatedAt: sql`now()` }).where(inArray(polls.id, stale)).returning({ id: polls.id })
  if (rows.length > 0) await inngest.send(rows.map((row) => ({ name: POLL_RENDER_EVENT, data: { pollId: row.id } })))
  return { closed: closed.length, requeued: rows.length }
}
