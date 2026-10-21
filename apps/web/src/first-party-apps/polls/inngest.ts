// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { inngest } from '@/lib/inngest/client'
import { POLL_RENDER_EVENT } from './handler'
import { renderPoll } from './polls'

// カードの描き直し。投票ごとに1本ずつ実行し、常に commit 済みの最新の集計から描く。chat.update の失敗は Inngest が再試行する
export const pollsCardRender = inngest.createFunction(
  { id: 'polls-card-render', concurrency: { key: 'event.data.pollId', limit: 1 } },
  { event: POLL_RENDER_EVENT },
  async ({ event, step }) => step.run('render', () => renderPoll((event.data as { pollId: string }).pollId)),
)

// commit 後にイベントを送る前に止まった・投稿の途中で失敗した投票を拾い直す（§7.3）。
// あわせて、30日より古い処理済みインタラクションを消す
export const pollsCardSweep = inngest.createFunction(
  { id: 'polls-card-sweep', concurrency: { limit: 1 } },
  { cron: 'TZ=Asia/Tokyo */5 * * * *' },
  async ({ step }) => {
    // 締切を過ぎた投票を締める。版を進めるので、下の拾い直しで描き直される（締めるのは投稿済みのものだけ。冪等）
    const closed = await step.run('close-due-polls', async () => {
      const { db, polls } = await import('@cairn/db')
      const { and, eq, isNotNull, lte, sql } = await import('drizzle-orm')
      const rows = await db
        .update(polls)
        .set({ status: 'closed', closedAt: sql`now()`, version: sql`${polls.version} + 1`, updatedAt: sql`now() - interval '1 minute'` })
        .where(and(eq(polls.status, 'posted'), isNotNull(polls.closesAt), lte(polls.closesAt, sql`now()`)))
        .returning({ id: polls.id })
      return rows.map((row) => row.id)
    })
    const pollIds = await step.run('find-stale-polls', async () => {
      const { db, polls, pollProcessedInteractions } = await import('@cairn/db')
      const { and, asc, inArray, lt, or, sql } = await import('drizzle-orm')
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
          ),
        )
        .orderBy(asc(polls.updatedAt))
        .limit(200)
      const rows = await db.update(polls).set({ updatedAt: sql`now()` }).where(inArray(polls.id, stale)).returning({ id: polls.id })
      return rows.map((row) => row.id)
    })
    if (pollIds.length > 0) {
      await step.sendEvent('rerender', pollIds.map((pollId) => ({ name: POLL_RENDER_EVENT, data: { pollId } })))
    }
    return { closed: closed.length, requeued: pollIds.length }
  },
)
