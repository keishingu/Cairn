// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { inngest } from '@/lib/inngest/client'
import { closeDuePolls, nextCloseCheck, POLL_CLOSE_EVENT, POLL_RENDER_EVENT, renderPollExclusively } from './polls'

// カードの描き直し（応答後のその場の描画で描けなかった分と、毎時の拾い直し）。常に commit 済みの最新の集計から描き、
// その場の描画と重ならないよう投票ごとのリースを取る。chat.update の失敗は Inngest が再試行する
export const pollsCardRender = inngest.createFunction(
  { id: 'polls-card-render', concurrency: { key: 'event.data.pollId', limit: 1 } },
  { event: POLL_RENDER_EVENT },
  async ({ event, step }) => {
    const pollId = (event.data as { pollId: string }).pollId
    const result = await step.run('render', () => renderPollExclusively(pollId))
    // 票が入り続けて描き切れなかったら、続きを次の実行に回す
    if (result === 'incomplete') await step.sendEvent('continue', { name: POLL_RENDER_EVENT, data: { pollId } })
    return result
  },
)

/** 1回に眠る長さの上限。Inngest のプランごとの上限（無料プランは7日）より短くする */
const MAX_SLEEP_MS = 6 * 24 * 60 * 60 * 1000

// 締切に締めてカードを描き直す。投稿時に投票ごとに1本予約し、締切まで眠る（眠っている間は実行数を使わない）。
// 投票のために cron を回し続けないための仕組みで、予約を送れなかった投票は毎時の拾い直しが締める
export const pollsCardClose = inngest.createFunction(
  { id: 'polls-card-close' },
  { event: POLL_CLOSE_EVENT },
  async ({ event, step }) => {
    const pollId = (event.data as { pollId: string }).pollId
    // 締切は起きるたびに DB から読み直す（締め切りボタンで先に締められていれば、何もせずに終わる）
    for (let round = 0; ; round++) {
      const next = await step.run(`check-deadline-${round}`, () => nextCloseCheck(pollId, MAX_SLEEP_MS))
      if (next === null) return 'skipped'
      if (next === 'due') break
      await step.sleepUntil(`wait-for-deadline-${round}`, next)
    }
    const closed = await step.run('close', () => closeDuePolls(pollId))
    if (closed.length === 0) return 'skipped'
    const result = await step.run('render', () => renderPollExclusively(pollId))
    if (result === 'incomplete') await step.sendEvent('continue-render', { name: POLL_RENDER_EVENT, data: { pollId } })
    return result
  },
)
