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
  const okCheck = async (raw: string) => ({ ok: true as const, url: new URL(raw), devLoopback: false })
  type SendInput = Parameters<NonNullable<Parameters<typeof deliverToApp>[0]['send']>>[0]

  it('payload= の form で送り、受け取った側が Slack と同じ手順で署名を検証できる', async () => {
    const send = vi.fn(async (_input: SendInput) => ({ status: 200, body: '' }))
    const result = await deliverToApp({ requestUrl: 'https://app.example.com/i', signingSecret: 'secret', payload: { type: 'block_actions' }, send, checkUrl: okCheck })
    expect(result).toMatchObject({ status: 'delivered', httpStatus: 200 })

    const input = send.mock.calls[0]![0]
    expect(input.timeoutMs).toBe(3000)
    expect(input.allowLoopback).toBe(false)
    expect(new URLSearchParams(input.body).get('payload')).toBe('{"type":"block_actions"}')
    expect(verifyRequestSignature({ signingSecret: 'secret', timestamp: input.headers['X-Slack-Request-Timestamp']!, signature: input.headers['X-Slack-Signature']!, body: input.body })).toBe(true)
  })

  it('2xx 以外（リダイレクトを含む）は失敗、時間切れは timeout、接続時に内部アドレスと分かれば blocked にする', async () => {
    const redirect = async () => ({ status: 302, body: '' })
    await expect(deliverToApp({ requestUrl: 'https://a.example.com', signingSecret: 's', payload: {}, send: redirect, checkUrl: okCheck })).resolves.toMatchObject({ status: 'failed', httpStatus: 302 })

    const timeout = async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    }
    await expect(deliverToApp({ requestUrl: 'https://a.example.com', signingSecret: 's', payload: {}, send: timeout, checkUrl: okCheck })).resolves.toMatchObject({ status: 'timeout' })

    const rebound = async () => {
      throw Object.assign(new Error('Request URL が内部のアドレスを指しています'), { code: 'EBLOCKEDADDRESS' })
    }
    await expect(deliverToApp({ requestUrl: 'https://a.example.com', signingSecret: 's', payload: {}, send: rebound, checkUrl: okCheck })).resolves.toMatchObject({ status: 'blocked' })
  })

  it('送り先の検証に通らなければ送らずに blocked にする', async () => {
    const send = vi.fn()
    const result = await deliverToApp({
      requestUrl: 'https://internal.example.com',
      signingSecret: 's',
      payload: {},
      send,
      checkUrl: async () => ({ ok: false, reason: 'Request URL が内部のアドレスを指しています' }),
    })
    expect(result).toMatchObject({ status: 'blocked', error: 'Request URL が内部のアドレスを指しています' })
    expect(send).not.toHaveBeenCalled()
  })
})
