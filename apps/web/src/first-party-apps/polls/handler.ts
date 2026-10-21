// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { firstPartySigningSecret } from '@/lib/apps/first-party'
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyRequestSignature } from '@/lib/apps/signing'
import { inngest } from '@/lib/inngest/client'
import { callBotApi } from './bot-client'
import { createPoll } from './polls'
import { CREATE_POLL_CALLBACK_ID, createPollModal, onlyCreatorCanCloseModal, parsePollSubmission } from './render'

// 投票アプリの Request URL。外部アプリと同じく、署名付きで届くインタラクションだけを受ける（docs/app-platform-design.md §7）

export const POLL_RENDER_EVENT = 'polls/card.render'

type BlockActionsPayload = {
  type: 'block_actions'
  team: { id: string }
  user: { id: string }
  trigger_id: string
  container: { message_ts: string; channel_id: string }
  actions: Array<{ action_id: string; value?: string }>
  cairn?: { interaction_id?: string }
}

type ViewSubmissionPayload = {
  type: 'view_submission'
  team: { id: string }
  user: { id: string }
  view: { id: string; callback_id?: string; private_metadata?: string; state: { values: Parameters<typeof parsePollSubmission>[0] } }
}

export async function handlePollsRequest(req: Request): Promise<Response> {
  const body = await req.text()
  const verified = verifyRequestSignature({
    signingSecret: firstPartySigningSecret('polls'),
    timestamp: req.headers.get(TIMESTAMP_HEADER),
    signature: req.headers.get(SIGNATURE_HEADER),
    body,
  })
  if (!verified) return new NextResponse('invalid signature', { status: 401 })

  const form = new URLSearchParams(body)
  const rawPayload = form.get('payload')
  if (rawPayload === null) {
    if (form.get('command') !== '/poll') return new NextResponse('', { status: 200 })
    // 作成メニューの「投票を作成」。押した本人にだけモーダルを開く
    await callBotApi(form.get('team_id') ?? '', 'views.open', { trigger_id: form.get('trigger_id'), view: createPollModal(form.get('channel_id') ?? '') })
    return new NextResponse('', { status: 200 })
  }

  const payload = JSON.parse(rawPayload) as BlockActionsPayload | ViewSubmissionPayload | { type: string }
  if (payload.type === 'view_submission') return handleViewSubmission(payload as ViewSubmissionPayload)
  if (payload.type === 'block_actions') return handleBlockActions(payload as BlockActionsPayload)
  return new NextResponse('', { status: 200 })
}

async function handleViewSubmission(payload: ViewSubmissionPayload): Promise<Response> {
  if (payload.view.callback_id !== CREATE_POLL_CALLBACK_ID) return new NextResponse('', { status: 200 })
  const parsed = parsePollSubmission(payload.view.state.values)
  if (!parsed.ok) return NextResponse.json({ response_action: 'errors', errors: parsed.errors })
  const { channelId } = JSON.parse(payload.view.private_metadata ?? '{}') as { channelId?: string }
  if (!channelId) return NextResponse.json({ response_action: 'errors', errors: { question: 'チャンネルが分からないため作成できません' } })

  // 同じモーダルの送信の再試行（応答が失われて押し直した場合）は、同じ投票に収束させる
  await createPoll({
    workspaceId: payload.team.id,
    channelId,
    createdBy: payload.user.id,
    question: parsed.question,
    options: parsed.options,
    allowMultiple: parsed.allowMultiple,
    idempotencyKey: `view:${payload.view.id}`,
  })
  return new NextResponse('', { status: 200 })
}

async function handleBlockActions(payload: BlockActionsPayload): Promise<Response> {
  const action = payload.actions[0]
  const interactionId = payload.cairn?.interaction_id
  if (!action || !interactionId) return new NextResponse('', { status: 200 })

  const { db, polls, pollOptions, pollVotes, pollProcessedInteractions } = await import('@cairn/db')
  const { and, eq, sql } = await import('drizzle-orm')
  const [poll] = await db.select({ id: polls.id, createdBy: polls.createdBy }).from(polls).where(eq(polls.messageId, payload.container.message_ts)).limit(1)
  if (!poll) return new NextResponse('', { status: 200 })

  if (action.action_id === 'close' && poll.createdBy !== payload.user.id) {
    // カードは全員に同じなので、押した本人にだけ知らせるにはモーダルを使う
    await callBotApi(payload.team.id, 'views.open', { trigger_id: payload.trigger_id, view: onlyCreatorCanCloseModal() })
    return new NextResponse('', { status: 200 })
  }

  const changed = await db.transaction(async (tx) => {
    // 投票ごとに直列化し、締切との競合や同時投票で集計がずれないようにする
    const [locked] = await tx.select({ status: polls.status, allowMultiple: polls.allowMultiple }).from(polls).where(eq(polls.id, poll.id)).for('update')
    if (!locked) return false
    // 応答が失われて同じ押下が再送されても二重に処理しない（§5.4）
    const processed = await tx.insert(pollProcessedInteractions).values({ interactionId, pollId: poll.id }).onConflictDoNothing().returning({ id: pollProcessedInteractions.interactionId })
    if (processed.length === 0) return false
    if (locked.status === 'closed') return false

    if (action.action_id === 'vote') {
      const optionId = action.value?.startsWith('option:') ? action.value.slice('option:'.length) : null
      if (!optionId) return false
      const [option] = await tx.select({ id: pollOptions.id }).from(pollOptions).where(and(eq(pollOptions.id, optionId), eq(pollOptions.pollId, poll.id))).limit(1)
      if (!option) return false
      // 「投票」は何度押しても同じ結果にする（トグルにしない）。単一選択はその選択肢に置き換える
      if (!locked.allowMultiple) await tx.delete(pollVotes).where(and(eq(pollVotes.pollId, poll.id), eq(pollVotes.userId, payload.user.id)))
      await tx.insert(pollVotes).values({ pollId: poll.id, optionId, userId: payload.user.id, allowMultiple: locked.allowMultiple }).onConflictDoNothing()
    } else if (action.action_id === 'clear-vote') {
      await tx.delete(pollVotes).where(and(eq(pollVotes.pollId, poll.id), eq(pollVotes.userId, payload.user.id)))
    } else if (action.action_id === 'close') {
      await tx.update(polls).set({ status: 'closed', closedAt: sql`now()` }).where(eq(polls.id, poll.id))
    } else {
      return false
    }
    await tx.update(polls).set({ version: sql`${polls.version} + 1`, updatedAt: sql`now()` }).where(eq(polls.id, poll.id))
    return true
  })

  // カードの描き直しは commit の後。送れなくても cron が version > rendered_version を拾い直す（§7.3）
  if (changed) {
    await inngest.send({ name: POLL_RENDER_EVENT, data: { pollId: poll.id } }).catch((err: unknown) => {
      console.warn('[polls] card render event failed (Inngest not running?):', err)
    })
  }
  return new NextResponse('', { status: 200 })
}
