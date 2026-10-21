// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { getFirstPartyInstallationId } from '@/lib/apps/first-party'
import { callBotApi } from './bot-client'
import { renderPollCard, type PollForRender } from './render'

// 投票の作成・投稿・カードの再描画。外部 HTTP（Bot API）はトランザクションの外で呼び、
// DB の状態（status・version・rendered_version）から再試行が同じ結果に収束するようにする（docs/app-platform-design.md §7.3・§7.4）

export type CreatePollInput = {
  workspaceId: string
  channelId: string
  createdBy: string | null
  question: string
  options: string[]
  allowMultiple: boolean
  /** 呼び出し元ごとに一意（定期ジョブは run の ID、モーダルは view の ID）。再試行は既存の投票を返す */
  idempotencyKey: string
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
    status: poll.status as PollForRender['status'],
    options,
    votes,
  }
  return { poll, forRender }
}

async function workspaceOfInstallation(installationId: string): Promise<string> {
  const { db, appInstallations } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const [row] = await db.select({ workspaceId: appInstallations.workspaceId }).from(appInstallations).where(eq(appInstallations.id, installationId)).limit(1)
  if (!row) throw new Error(`installation ${installationId} not found`)
  return row.workspaceId
}

/** 投票を投稿待ち（pending_post）で作る。同じ冪等キーの再試行は既存の投票を返す */
export async function createPendingPoll(input: CreatePollInput): Promise<string> {
  const { db, polls, pollOptions } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
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
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({ target: [polls.installationId, polls.idempotencyKey] })
      .returning({ id: polls.id })
    if (!created) {
      const [existing] = await tx
        .select({ id: polls.id })
        .from(polls)
        .where(and(eq(polls.installationId, installationId), eq(polls.idempotencyKey, input.idempotencyKey)))
        .limit(1)
      if (!existing) throw new Error('poll idempotency conflict without a row')
      return existing.id
    }
    await tx.insert(pollOptions).values(input.options.map((label, position) => ({ pollId: created.id, label, position })))
    return created.id
  })
}

/** 投票を作り、カードを投稿する。同じ冪等キーの再試行は同じ投票・同じメッセージに収束する */
export async function createPoll(input: CreatePollInput): Promise<{ pollId: string; messageId: string }> {
  const pollId = await createPendingPoll(input)
  const messageId = await postPoll(pollId)
  return { pollId, messageId }
}

/** 投稿待ちの投票を投稿する。client_msg_id を事前に採番しているので、途中で失敗しても再試行で二重に投稿されない */
export async function postPoll(pollId: string): Promise<string> {
  const loaded = await loadPoll(pollId)
  if (!loaded) throw new Error(`poll ${pollId} not found`)
  const { poll, forRender } = loaded
  if (poll.messageId) return poll.messageId

  const workspaceId = await workspaceOfInstallation(poll.installationId)
  const card = renderPollCard({ ...forRender, status: forRender.status === 'pending_post' ? 'posted' : forRender.status })
  const result = await callBotApi<{ ts: string }>(workspaceId, 'chat.postMessage', {
    channel: poll.channelId,
    text: card.text,
    blocks: card.blocks,
    client_msg_id: poll.clientMsgId,
  })

  const { db, polls } = await import('@cairn/db')
  const { eq, sql } = await import('drizzle-orm')
  await db
    .update(polls)
    .set({
      messageId: result.ts,
      status: sql`case when ${polls.status} = 'pending_post' then 'posted' else ${polls.status} end`,
      renderedVersion: sql`greatest(${polls.renderedVersion}, ${poll.version})`,
      updatedAt: sql`now()`,
    })
    .where(eq(polls.id, pollId))
  return result.ts
}

/**
 * カードを今の集計で描き直す。読んだ時点の version を描き、描いた版を rendered_version に記録する。
 * 投票ごとに1本ずつ実行される（Inngest の concurrency）ので、同時投票で古い集計が後勝ちしない
 */
export async function renderPoll(pollId: string): Promise<'posted' | 'updated' | 'skipped'> {
  const loaded = await loadPoll(pollId)
  if (!loaded) return 'skipped'
  const { poll, forRender } = loaded
  if (!poll.messageId) {
    await postPoll(pollId)
    return 'posted'
  }
  if (poll.version <= poll.renderedVersion) return 'skipped'

  const workspaceId = await workspaceOfInstallation(poll.installationId)
  const card = renderPollCard(forRender)
  await callBotApi(workspaceId, 'chat.update', { channel: poll.channelId, ts: poll.messageId, blocks: card.blocks })

  const { db, polls } = await import('@cairn/db')
  const { eq, sql } = await import('drizzle-orm')
  await db
    .update(polls)
    .set({ renderedVersion: sql`greatest(${polls.renderedVersion}, ${poll.version})`, updatedAt: sql`now()` })
    .where(eq(polls.id, pollId))
  return 'updated'
}
