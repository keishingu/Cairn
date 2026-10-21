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
    const pollIds = await step.run('find-stale-polls', async () => {
      const { db, polls, pollProcessedInteractions } = await import('@cairn/db')
      const { and, lt, or, sql } = await import('drizzle-orm')
      await db.delete(pollProcessedInteractions).where(lt(pollProcessedInteractions.createdAt, sql`now() - interval '30 days'`))
      const rows = await db
        .select({ id: polls.id })
        .from(polls)
        .where(and(or(sql`${polls.version} > ${polls.renderedVersion}`, sql`${polls.status} = 'pending_post'`), lt(polls.updatedAt, sql`now() - interval '1 minute'`)))
        .limit(200)
      return rows.map((row) => row.id)
    })
    if (pollIds.length > 0) {
      await step.sendEvent('rerender', pollIds.map((pollId) => ({ name: POLL_RENDER_EVENT, data: { pollId } })))
    }
    return { requeued: pollIds.length }
  },
)
