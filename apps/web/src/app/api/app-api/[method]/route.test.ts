// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockVerifyBotToken, mockDispatch } = vi.hoisted(() => ({ mockVerifyBotToken: vi.fn(), mockDispatch: vi.fn() }))
vi.mock('@/lib/apps/bot-tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/apps/bot-tokens')>()),
  verifyBotToken: mockVerifyBotToken,
}))
vi.mock('@/lib/apps/web-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/apps/web-api')>()),
  dispatchWebApi: mockDispatch,
}))

import { BotAuthError } from '@/lib/apps/bot-tokens'
import { POST } from './route'

const bot = { tokenId: 't', installationId: 'i', appId: 'a', workspaceId: 'w', botProfileId: 'b', scopes: ['chat:write'] }

function call(method: string, init: RequestInit) {
  return POST(new Request(`http://localhost/api/app-api/${method}`, { method: 'POST', ...init }), { params: Promise.resolve({ method }) })
}

describe('/api/app-api/[method]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyBotToken.mockResolvedValue(bot)
    mockDispatch.mockResolvedValue({ ok: true })
  })

  it('Bolt と同じ form-urlencoded の本文を受け取り、token を除いた引数でメソッドを呼ぶ', async () => {
    const body = new URLSearchParams({ channel: 'c1', text: 'hi', blocks: '[{"type":"divider"}]', token: 'cairn_bot_x' }).toString()
    const res = await call('chat.postMessage', { body, headers: { 'content-type': 'application/x-www-form-urlencoded' } })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(mockVerifyBotToken).toHaveBeenCalledWith('cairn_bot_x')
    expect(mockDispatch).toHaveBeenCalledWith('chat.postMessage', bot, { channel: 'c1', text: 'hi', blocks: '[{"type":"divider"}]' })
  })

  it('JSON の本文と Authorization ヘッダーのトークンを受け取り、ヘッダーを本文より優先する', async () => {
    await call('chat.postMessage', {
      body: JSON.stringify({ channel: 'c1', blocks: [{ type: 'divider' }], token: 'cairn_bot_body' }),
      headers: { 'content-type': 'application/json; charset=utf-8', authorization: 'Bearer cairn_bot_header' },
    })
    expect(mockVerifyBotToken).toHaveBeenCalledWith('cairn_bot_header')
    expect(mockDispatch).toHaveBeenCalledWith('chat.postMessage', bot, { channel: 'c1', blocks: [{ type: 'divider' }] })
  })

  it('知らないメソッドはトークンを確かめる前に unknown_method を返す', async () => {
    const res = await call('admin.users.list', { body: '' })
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'unknown_method' })
    expect(mockVerifyBotToken).not.toHaveBeenCalled()
  })

  it('認証の失敗は Slack と同じく 200 と ok: false のエラーコードで返す', async () => {
    mockVerifyBotToken.mockRejectedValue(new BotAuthError('token_revoked'))
    const res = await call('auth.test', { body: '' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'token_revoked' })
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('呼び出し回数の超過だけは 429 と Retry-After を返す', async () => {
    mockVerifyBotToken.mockRejectedValue(new BotAuthError('ratelimited'))
    const res = await call('auth.test', { body: '' })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('60')
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'ratelimited' })
  })

  it('1MB を超える本文は認証の前に読み切らず invalid_form_data にする（マルチバイトはバイト数で数える）', async () => {
    const res = await call('chat.postMessage', { body: 'あ'.repeat(400_000), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'invalid_form_data' })
    expect(mockVerifyBotToken).not.toHaveBeenCalled()
  })

  it('壊れた JSON の本文は invalid_form_data にする', async () => {
    const res = await call('chat.postMessage', { body: '{', headers: { 'content-type': 'application/json' } })
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'invalid_form_data' })
  })

  it('想定外の例外は内容を返さず internal_error にする', async () => {
    mockDispatch.mockRejectedValue(new Error('db down: password=secret'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call('auth.test', { body: '' })
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'internal_error' })
  })
})
