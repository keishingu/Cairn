// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Step = {
  run: (name: string, callback: () => unknown) => Promise<unknown>
  sleepUntil: (name: string, time: string) => Promise<void>
  sendEvent: (name: string, payload: unknown) => Promise<void>
}
type CapturedHandler = (args: { event: { data: { pollId: string } }; step: Step }) => Promise<unknown>

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, CapturedHandler>() }))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: (options: { id: string }, _trigger: unknown, handler: CapturedHandler) => {
      handlers.set(options.id, handler)
      return { options }
    },
    send: vi.fn(),
  },
}))
vi.mock('./polls', () => ({
  POLL_CLOSE_EVENT: 'polls/card.close',
  POLL_RENDER_EVENT: 'polls/card.render',
  nextCloseCheck: vi.fn(),
  closeDuePolls: vi.fn(),
  renderPollExclusively: vi.fn(),
}))

import './inngest'
import { closeDuePolls, nextCloseCheck, renderPollExclusively } from './polls'

function runClose() {
  const step = {
    run: vi.fn((_name: string, callback: () => unknown) => Promise.resolve(callback())),
    sleepUntil: vi.fn(async () => {}),
    sendEvent: vi.fn(async () => {}),
  }
  const handler = handlers.get('polls-card-close')
  expect(handler).toBeDefined()
  return { step, result: handler!({ event: { data: { pollId: 'poll-1' } }, step }) }
}

describe('pollsCardClose', () => {
  beforeEach(() => {
    vi.mocked(nextCloseCheck).mockReset()
    vi.mocked(closeDuePolls).mockReset()
    vi.mocked(renderPollExclusively).mockReset()
  })

  it('締切まで眠ってから締め、カードを描き直す', async () => {
    vi.mocked(nextCloseCheck).mockResolvedValueOnce('2026-11-10T00:00:00.000Z').mockResolvedValueOnce('due')
    vi.mocked(closeDuePolls).mockResolvedValue(['poll-1'])
    vi.mocked(renderPollExclusively).mockResolvedValue('updated')
    const { step, result } = runClose()

    await expect(result).resolves.toBe('updated')
    expect(step.sleepUntil).toHaveBeenCalledWith('wait-for-deadline', '2026-11-10T00:00:00.000Z')
    expect(closeDuePolls).toHaveBeenCalledWith('poll-1')
  })

  it('起きても締切がまだ先なら、同じ実行で眠り直さず新しい実行に引き継ぐ', async () => {
    vi.mocked(nextCloseCheck).mockResolvedValueOnce('2026-11-10T00:00:00.000Z').mockResolvedValueOnce('2026-11-16T00:00:00.000Z')
    const { step, result } = runClose()

    await expect(result).resolves.toBe('handed_over')
    expect(step.sleepUntil).toHaveBeenCalledTimes(1)
    expect(step.sendEvent).toHaveBeenCalledWith('hand-over', { id: 'poll-close-poll-1-2026-11-10T00:00:00.000Z', name: 'polls/card.close', data: { pollId: 'poll-1' } })
    expect(closeDuePolls).not.toHaveBeenCalled()
  })

  it('締切の前に締め切りボタンで締められていれば、何もせずに終わる', async () => {
    vi.mocked(nextCloseCheck).mockResolvedValue(null)
    const { step, result } = runClose()

    await expect(result).resolves.toBe('skipped')
    expect(step.sleepUntil).not.toHaveBeenCalled()
    expect(closeDuePolls).not.toHaveBeenCalled()
  })

  it('描き切れなかったら描き直しのイベントに続きを任せる', async () => {
    vi.mocked(nextCloseCheck).mockResolvedValue('due')
    vi.mocked(closeDuePolls).mockResolvedValue(['poll-1'])
    vi.mocked(renderPollExclusively).mockResolvedValue('incomplete')
    const { step, result } = runClose()

    await result
    expect(step.sendEvent).toHaveBeenCalledWith('continue-render', { name: 'polls/card.render', data: { pollId: 'poll-1' } })
  })
})
