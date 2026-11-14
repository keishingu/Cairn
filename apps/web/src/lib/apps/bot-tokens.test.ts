// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { BOT_TOKEN_PREFIX, BotAuthError, createBotToken, hashBotToken, verifyBotToken } from './bot-tokens'

describe('Bot トークン', () => {
  it('cairn_bot_ で始まる推測できないトークンを作り、DB には hash だけを渡す', () => {
    const first = createBotToken()
    const second = createBotToken()
    expect(first.token.startsWith(BOT_TOKEN_PREFIX)).toBe(true)
    expect(first.token).not.toBe(second.token)
    expect(first.hash).toBe(hashBotToken(first.token))
    expect(first.hash).not.toContain(first.token)
    expect(first.prefix).toBe(first.token.slice(0, BOT_TOKEN_PREFIX.length + 8))
  })

  it('トークンが無ければ not_authed、PAT など別系統の形式なら DB を引かずに invalid_auth にする', async () => {
    await expect(verifyBotToken(null)).rejects.toEqual(new BotAuthError('not_authed'))
    await expect(verifyBotToken('cairn_pat_abc')).rejects.toEqual(new BotAuthError('invalid_auth'))
    await expect(verifyBotToken('xoxb-123')).rejects.toEqual(new BotAuthError('invalid_auth'))
  })
})
