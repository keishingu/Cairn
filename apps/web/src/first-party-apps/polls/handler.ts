// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { after, NextResponse } from 'next/server'
import { firstPartySigningSecret } from '@/lib/apps/first-party'
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyRequestSignature } from '@/lib/apps/signing'
import { inngest } from '@/lib/inngest/client'
import { callBotApi } from './bot-client'
import { createPendingPoll } from './polls'
import { pollInputErrors } from './validate'
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
    openViewAfterResponse(form.get('team_id') ?? '', form.get('trigger_id'), createPollModal(form.get('channel_id') ?? ''))
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
  // 投稿は応答の後なので、作る前に投稿の安全フィルタも含めて確かめ、閉じたモーダルの裏で投稿だけが失敗し続けないようにする
  const inputErrors = pollInputErrors(parsed.question, parsed.options)
  if (inputErrors) return NextResponse.json({ response_action: 'errors', errors: inputErrors })
  const { channelId } = JSON.parse(payload.view.private_metadata ?? '{}') as { channelId?: string }
  if (!channelId) return NextResponse.json({ response_action: 'errors', errors: { question: 'チャンネルが分からないため作成できません' } })

  // 同じモーダルの送信の再試行（応答が失われて押し直した場合）は、同じ投票に収束させる。
  // 配信は3秒で打ち切られるので、ここでは投稿待ちで保存して応答し、カードの投稿は描画イベントに任せる
  const { pollId, sameInput } = await createPendingPoll({
    workspaceId: payload.team.id,
    channelId,
    createdBy: payload.user.id,
    question: parsed.question,
    options: parsed.options,
    allowMultiple: parsed.allowMultiple,
    idempotencyKey: `view:${payload.view.id}`,
  })
  sendRenderEvent(pollId)
  if (!sameInput) {
    // 前の送信は応答が届かなかっただけで作成済み。直した内容で作り直したように見せず、作成済みであることを伝える
    return NextResponse.json({
      response_action: 'errors',
      errors: { question: 'このフォームからはすでに投票を作成しました（前回の内容で投稿されます）。キャンセルして閉じてください' },
    })
  }
  return new NextResponse('', { status: 200 })
}

async function handleBlockActions(payload: BlockActionsPayload): Promise<Response> {
  const action = payload.actions[0]
  const interactionId = payload.cairn?.interaction_id
  if (!action || !interactionId) return new NextResponse('', { status: 200 })
  // ts は Cairn のメッセージ ID（UUID）。それ以外は uuid 列との比較で DB エラーにせず、署名済みの不正な要求として断る
  if (!/^[0-9a-f-]{36}$/i.test(payload.container.message_ts)) return new NextResponse('invalid message_ts', { status: 400 })

  const { db, polls, pollOptions, pollVotes, pollProcessedInteractions } = await import('@cairn/db')
  const { and, eq, or, sql } = await import('drizzle-orm')
  // カードの ts は投稿前に採番した client_msg_id。投稿直後に message_id の保存が遅れても（失敗して回復待ちでも）同じ投票に届ける
  const [poll] = await db
    .select({ id: polls.id, createdBy: polls.createdBy })
    .from(polls)
    .where(or(eq(polls.messageId, payload.container.message_ts), eq(polls.clientMsgId, payload.container.message_ts)))
    .limit(1)
  if (!poll) return new NextResponse('', { status: 200 })

  if (action.action_id === 'close' && poll.createdBy !== payload.user.id) {
    // カードは全員に同じなので、押した本人にだけ知らせるにはモーダルを使う
    openViewAfterResponse(payload.team.id, payload.trigger_id, onlyCreatorCanCloseModal())
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

  // カードの描き直しは commit の後
  if (changed) sendRenderEvent(poll.id)
  return new NextResponse('', { status: 200 })
}

// 応答を返した後に送る。Inngest が遅くても3秒の配信期限を使わせない。送れなくても、投稿待ち・描画待ちの投票は cron が拾い直す（§7.3）
function sendRenderEvent(pollId: string): void {
  after(() =>
    inngest.send({ name: POLL_RENDER_EVENT, data: { pollId } }).catch((err: unknown) => {
      console.warn('[polls] card render event failed (Inngest not running?):', err)
    }),
  )
}

// views.open は応答を返した後に呼ぶ。Bot API が遅くても3秒の配信期限を使わせず、起動が app_timeout になって押し直しで二重に開くのを防ぐ。
// trigger_id は発行から6秒（配送の3秒＋応答後の3秒）有効なので、応答の直後に呼べば間に合う
function openViewAfterResponse(workspaceId: string, triggerId: string | null, view: unknown): void {
  after(() =>
    callBotApi(workspaceId, 'views.open', { trigger_id: triggerId, view }).catch((err: unknown) => {
      console.error('[polls] views.open failed:', err)
    }),
  )
}
