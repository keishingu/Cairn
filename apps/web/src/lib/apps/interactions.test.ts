// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'
import { pollCardFixture } from '@cairn/shared/blocks/fixtures'
import { buildBlockActionsPayload, deliverToApp, resolveAction } from './interactions'
import { verifyRequestSignature } from './signing'

const stored = JSON.parse(JSON.stringify(pollCardFixture)) as unknown[]
const select = {
  type: 'actions',
  block_id: 'pick',
  elements: [{ type: 'static_select', action_id: 's', options: [{ text: { type: 'plain_text', text: '参加' }, value: 'yes' }] }],
}

describe('押された要素の解決', () => {
  it('ボタンの value はクライアントではなく保存済みの blocks から引く', () => {
    expect(resolveAction(stored, { type: 'button', blockId: 'option-2', actionId: 'vote' })).toEqual({
      ok: true,
      action: { type: 'button', block_id: 'option-2', action_id: 'vote', text: { type: 'plain_text', text: '投票' }, value: 'option:2' },
    })
  })

  it('select は選ばれた値が保存済みの選択肢にあるときだけ、選択肢をそのまま届ける', () => {
    expect(resolveAction([select], { type: 'static_select', blockId: 'pick', actionId: 's', selectedOptionValue: 'yes' })).toMatchObject({
      ok: true,
      action: { selected_option: { value: 'yes', text: { text: '参加' } } },
    })
    expect(resolveAction([select], { type: 'static_select', blockId: 'pick', actionId: 's', selectedOptionValue: 'forged' })).toEqual({ ok: false, error: 'invalid_option' })
  })

  it('存在しない block_id・action_id や、種類の違う要素は action_not_found にする', () => {
    expect(resolveAction(stored, { type: 'button', blockId: 'nope', actionId: 'vote' })).toEqual({ ok: false, error: 'action_not_found' })
    expect(resolveAction(stored, { type: 'button', blockId: 'option-1', actionId: 'other' })).toEqual({ ok: false, error: 'action_not_found' })
    expect(resolveAction(stored, { type: 'static_select', blockId: 'option-1', actionId: 'vote', selectedOptionValue: 'x' })).toEqual({ ok: false, error: 'action_not_found' })
    expect(resolveAction(null, { type: 'button', blockId: 'option-1', actionId: 'vote' })).toEqual({ ok: false, error: 'action_not_found' })
  })
})

describe('block_actions のペイロード', () => {
  it('Slack と同じ形で、UUID の ID と cairn.interaction_id を入れる', () => {
    const resolved = resolveAction(stored, { type: 'button', blockId: 'option-1', actionId: 'vote' })
    if (!resolved.ok) throw new Error('unreachable')
    const payload = buildBlockActionsPayload(
      {
        workspace: { id: 'w1', slug: 'sangakubu' },
        user: { id: 'u1', name: '山田' },
        appId: 'a1',
        channel: { id: 'c1', name: '登山本部' },
        message: { id: 'm1', text: '代替', botProfileId: 'b1', installationId: 'i1', blocks: stored },
        action: resolved.action,
      },
      'interaction-1',
      1700000000123,
    )
    expect(payload).toMatchObject({
      type: 'block_actions',
      team: { id: 'w1', domain: 'sangakubu' },
      user: { id: 'u1', name: '山田', team_id: 'w1' },
      api_app_id: 'a1',
      container: { type: 'message', message_ts: 'm1', channel_id: 'c1' },
      channel: { id: 'c1', name: '登山本部' },
      message: { ts: 'm1', text: '代替', user: 'b1', bot_id: 'i1' },
      actions: [{ type: 'button', block_id: 'option-1', action_id: 'vote', value: 'option:1', action_ts: '1700000000.123000' }],
      cairn: { message_id: 'm1', interaction_id: 'interaction-1' },
    })
  })
})

describe('アプリへの配送', () => {
  const okCheck = async (raw: string) => ({ ok: true as const, url: new URL(raw) })

  it('payload= の form で送り、受け取った側が Slack と同じ手順で署名を検証できる', async () => {
    const fetchImpl = vi.fn<(url: unknown, init?: RequestInit) => Promise<Response>>(async () => new Response('', { status: 200 }))
    const result = await deliverToApp({ requestUrl: 'https://app.example.com/i', signingSecret: 'secret', payload: { type: 'block_actions' }, fetchImpl: fetchImpl as unknown as typeof fetch, checkUrl: okCheck })
    expect(result).toMatchObject({ status: 'delivered', httpStatus: 200 })

    const init = fetchImpl.mock.calls[0]![1]!
    const headers = init.headers as Record<string, string>
    expect(init.redirect).toBe('manual')
    expect(new URLSearchParams(String(init.body)).get('payload')).toBe('{"type":"block_actions"}')
    expect(verifyRequestSignature({ signingSecret: 'secret', timestamp: headers['X-Slack-Request-Timestamp']!, signature: headers['X-Slack-Signature']!, body: String(init.body) })).toBe(true)
  })

  it('2xx 以外とリダイレクトは失敗、時間切れは timeout として返す', async () => {
    const redirect = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://10.0.0.1/' } }))
    await expect(deliverToApp({ requestUrl: 'https://a.example.com', signingSecret: 's', payload: {}, fetchImpl: redirect as unknown as typeof fetch, checkUrl: okCheck })).resolves.toMatchObject({ status: 'failed', httpStatus: 302 })

    const timeout = vi.fn(async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    })
    await expect(deliverToApp({ requestUrl: 'https://a.example.com', signingSecret: 's', payload: {}, fetchImpl: timeout as unknown as typeof fetch, checkUrl: okCheck })).resolves.toMatchObject({ status: 'timeout' })
  })

  it('送り先の検証に通らなければ送らずに blocked にする', async () => {
    const fetchImpl = vi.fn()
    const result = await deliverToApp({
      requestUrl: 'https://internal.example.com',
      signingSecret: 's',
      payload: {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
      checkUrl: async () => ({ ok: false, reason: 'Request URL が内部のアドレスを指しています' }),
    })
    expect(result).toMatchObject({ status: 'blocked', error: 'Request URL が内部のアドレスを指しています' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
