// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { isAppLocale, type AppLocale } from '@cairn/shared'
import { getFirstPartyInstallationId } from '@/lib/apps/first-party'
import { callBotApi, PollsBotApiError } from './bot-client'
import { renderPollCard, type PollForRender } from './render'
import { pollInputErrors } from './validate'

// 投票の作成・投稿・カードの再描画。外部 HTTP（Bot API）はトランザクションの外で呼び、
// DB の状態（status・version・rendered_version）から再試行が同じ結果に収束するようにする（docs/app-platform-design.md §7.3・§7.4）

export type CreatePollInput = {
  workspaceId: string
  channelId: string
  createdBy: string | null
  question: string
  options: string[]
  allowMultiple: boolean
  /** カードを描く言語（作成者の表示言語）。入力の誤りもこの言語で返す */
  locale: AppLocale
  /** 呼び出し元ごとに一意（定期ジョブは run の ID、モーダルは view の ID）。再試行は既存の投票を返す */
  idempotencyKey: string
  /** 締切。過ぎたら定期の処理（polls-card-sweep）が締め、カードを描き直す。作成者のいない定期ジョブの投票はこれで締める */
  closesAt?: Date | null
}

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
  const { eq, sql } = await import('drizzle-orm')
  const workspaceId = await workspaceOfInstallation(poll.installationId)
  const card = renderPollCard({ ...forRender, status: forRender.status === 'pending_post' ? 'posted' : forRender.status })
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
      // アーカイブの解除やアプリの再追加で投稿できるようになったら投稿する。5分ごとの cron が拾い直し続けないよう間隔を空ける
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
  return result.ts
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
      // 5分ごとの cron が拾い直し続けないよう、次に拾うまでの間隔を空ける（updated_at を先にずらす）
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
