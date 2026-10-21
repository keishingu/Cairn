// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { signRequest, verifyRequestSignature } from './signing'

// Slack の「Verifying requests from Slack」に載っている例。Bolt の検証がそのまま通る署名になっているかを確かめる
const SLACK_EXAMPLE = {
  secret: '8f742231b10e8888abcd99yyyzzz85a5',
  timestamp: 1531420618,
  body: 'token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c',
  signature: 'v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503',
}

describe('インタラクションの署名', () => {
  it('Slack の公開例と同じ v0 署名を作る', () => {
    expect(signRequest(SLACK_EXAMPLE.secret, SLACK_EXAMPLE.timestamp, SLACK_EXAMPLE.body)).toBe(SLACK_EXAMPLE.signature)
  })

  it('同じ署名シークレット・タイムスタンプ・本文なら検証を通す', () => {
    expect(verifyRequestSignature({ signingSecret: SLACK_EXAMPLE.secret, timestamp: String(SLACK_EXAMPLE.timestamp), signature: SLACK_EXAMPLE.signature, body: SLACK_EXAMPLE.body, nowSeconds: SLACK_EXAMPLE.timestamp + 10 })).toBe(true)
  })

  it('本文の改ざん・別のシークレット・5分より古いタイムスタンプ・ヘッダー欠落を拒否する', () => {
    const base = { signingSecret: SLACK_EXAMPLE.secret, timestamp: String(SLACK_EXAMPLE.timestamp), signature: SLACK_EXAMPLE.signature, body: SLACK_EXAMPLE.body, nowSeconds: SLACK_EXAMPLE.timestamp }
    expect(verifyRequestSignature({ ...base, body: `${base.body}x` })).toBe(false)
    expect(verifyRequestSignature({ ...base, signingSecret: 'other' })).toBe(false)
    expect(verifyRequestSignature({ ...base, nowSeconds: SLACK_EXAMPLE.timestamp + 301 })).toBe(false)
    expect(verifyRequestSignature({ ...base, signature: null })).toBe(false)
    expect(verifyRequestSignature({ ...base, timestamp: 'abc' })).toBe(false)
  })
})
