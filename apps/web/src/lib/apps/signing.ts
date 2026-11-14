// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createHmac, timingSafeEqual } from 'node:crypto'

// Slack と同じ署名（v0）。ヘッダー名も Slack のままにする（Bolt が名前を固定で読むため。docs/app-platform-design.md §5.3）
export const SIGNATURE_HEADER = 'X-Slack-Signature'
export const TIMESTAMP_HEADER = 'X-Slack-Request-Timestamp'
// Slack と同じく5分より古い要求はリプレイとして拒否する
export const SIGNATURE_MAX_AGE_SECONDS = 5 * 60

export function signRequest(signingSecret: string, timestamp: number, body: string): string {
  const digest = createHmac('sha256', signingSecret).update(`v0:${timestamp}:${body}`).digest('hex')
  return `v0=${digest}`
}

/**
 * 受け取る側（ファーストパーティのアプリ）の検証。比較は定数時間で行い、古いタイムスタンプは拒否する
 */
export function verifyRequestSignature(input: {
  signingSecret: string
  timestamp: string | null
  signature: string | null
  body: string
  nowSeconds?: number
}): boolean {
  if (!input.timestamp || !input.signature || !/^\d+$/.test(input.timestamp)) return false
  const timestamp = Number(input.timestamp)
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > SIGNATURE_MAX_AGE_SECONDS) return false
  const expected = Buffer.from(signRequest(input.signingSecret, timestamp, input.body))
  const actual = Buffer.from(input.signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
