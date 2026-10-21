// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareMessageBlocks } from '@cairn/shared'
import { pollCardFixture } from '@cairn/shared/blocks/fixtures'
import type { BotContext } from '../bot-tokens'

const { mockResolveBotChannel } = vi.hoisted(() => ({ mockResolveBotChannel: vi.fn() }))
vi.mock('./channel-access', () => ({ resolveBotChannel: mockResolveBotChannel }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(() => Promise.resolve()) } }))

import { chatPostMessage, fallbackTextFromBlocks } from './chat'
import { dispatchWebApi } from './index'

const bot: BotContext = {
  tokenId: 'token-1',
  installationId: 'installation-1',
  appId: 'app-1',
  workspaceId: 'workspace-1',
  botProfileId: 'bot-1',
  scopes: ['chat:write'],
}
const CHANNEL_ID = '00000000-0000-4000-8000-0000000000c1'

describe('chat.postMessage の入力検証', () => {
  beforeEach(() => {
    mockResolveBotChannel.mockResolvedValue({ ok: true, channel: { id: CHANNEL_ID, workspaceId: 'workspace-1', type: 'workspace', projectId: null } })
  })

  it('Bot が使えないチャンネルなら、その理由のエラーコードを返す', async () => {
    mockResolveBotChannel.mockResolvedValue({ ok: false, error: 'not_in_channel' })
    await expect(chatPostMessage(bot, { channel: CHANNEL_ID, text: 'hi' })).resolves.toEqual({ ok: false, error: 'not_in_channel' })
  })

  it('text も blocks も無ければ no_text にする', async () => {
    await expect(chatPostMessage(bot, { channel: CHANNEL_ID })).resolves.toEqual({ ok: false, error: 'no_text' })
  })

  it('thread_ts は黙って無視せず invalid_arguments にする（Cairn のスレッドは別チャンネルのため）', async () => {
    const result = await chatPostMessage(bot, { channel: CHANNEL_ID, text: 'hi', thread_ts: '1' })
    expect(result).toMatchObject({ ok: false, error: 'invalid_arguments' })
  })

  it('未対応の blocks は invalid_blocks にし、理由と位置を response_metadata で返す', async () => {
    const result = await chatPostMessage(bot, { channel: CHANNEL_ID, blocks: JSON.stringify([{ type: 'rich_text', elements: [] }]) })
    expect(result).toEqual({
      ok: false,
      error: 'invalid_blocks',
      response_metadata: { messages: ['[ERROR] 未対応のブロック種別です: rich_text [json-pointer:/blocks/0/type]'] },
    })
  })

  it('JSON として読めない blocks は invalid_blocks_format にする', async () => {
    await expect(chatPostMessage(bot, { channel: CHANNEL_ID, blocks: '[{' })).resolves.toEqual({ ok: false, error: 'invalid_blocks_format' })
  })

  it('長すぎる text は msg_too_long にする', async () => {
    await expect(chatPostMessage(bot, { channel: CHANNEL_ID, text: 'あ'.repeat(40001) })).resolves.toEqual({ ok: false, error: 'msg_too_long' })
  })

  it('UUID でない client_msg_id は invalid_arguments にする', async () => {
    const result = await chatPostMessage(bot, { channel: CHANNEL_ID, text: 'hi', client_msg_id: 'abc' })
    expect(result).toMatchObject({ ok: false, error: 'invalid_arguments' })
  })
})

describe('Web API のスコープ', () => {
  it('必要なスコープが無ければ missing_scope にし、必要なものと持っているものを返す', async () => {
    await expect(dispatchWebApi('users.info', bot, { user: 'x' })).resolves.toEqual({
      ok: false,
      error: 'missing_scope',
      needed: 'users:read',
      provided: 'chat:write',
    })
  })

  it('知らないメソッドは unknown_method にする', async () => {
    await expect(dispatchWebApi('admin.users.list', bot, {})).resolves.toEqual({ ok: false, error: 'unknown_method' })
  })
})

describe('blocks からの代替テキスト', () => {
  it('見出し・本文・フィールド・補足の文字を行ごとに並べ、画像は含めない', () => {
    const prepared = prepareMessageBlocks(JSON.parse(JSON.stringify(pollCardFixture)))
    if (!prepared.ok) throw new Error(prepared.errors.join('\n'))
    const text = fallbackTextFromBlocks(prepared.value)
    expect(text.split('\n')[0]).toBe('11月の登山本部 担当決め')
    expect(text).toContain('*第1週 (11/2〜)*')
    expect(text).toContain('単一選択 ・ 締切 11/20 23:59')
  })
})
