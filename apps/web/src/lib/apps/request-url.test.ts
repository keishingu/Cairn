// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { checkRequestUrl, isNonPublicAddress } from './request-url'

const publicResolver = async () => ['93.184.216.34']
const noEnv = {} as NodeJS.ProcessEnv
const devEnv = { NODE_ENV: 'development', APP_PLATFORM_ALLOW_LOOPBACK_REQUEST_URL: 'true', APP_URL: 'http://localhost:3128' } as NodeJS.ProcessEnv

describe('Request URL の検証', () => {
  it('公開アドレスに解決される https だけを通す', async () => {
    await expect(checkRequestUrl('https://app.example.com/slack/events', { resolve: publicResolver, env: noEnv })).resolves.toMatchObject({ ok: true })
    await expect(checkRequestUrl('http://app.example.com/slack/events', { resolve: publicResolver, env: noEnv })).resolves.toMatchObject({ ok: false })
  })

  it('内部のアドレスに解決されるホストは、名前が公開でも送らない（1つでも含まれれば拒否）', async () => {
    const resolve = async () => ['93.184.216.34', '10.0.0.5']
    await expect(checkRequestUrl('https://rebind.example.com/', { resolve, env: noEnv })).resolves.toMatchObject({ ok: false, reason: 'Request URL が内部のアドレスを指しています' })
    await expect(checkRequestUrl('https://169.254.169.254/latest', { env: noEnv })).resolves.toMatchObject({ ok: false })
    await expect(checkRequestUrl('https://[::1]/', { env: noEnv })).resolves.toMatchObject({ ok: false })
  })

  it('認証情報入りの URL と解釈できない URL を拒否する', async () => {
    await expect(checkRequestUrl('https://user:pass@app.example.com/', { resolve: publicResolver, env: noEnv })).resolves.toMatchObject({ ok: false })
    await expect(checkRequestUrl('not a url', { env: noEnv })).resolves.toMatchObject({ ok: false })
  })

  it('開発環境で明示的に許したときだけ、APP_URL と同じ origin の http ループバックを通す', async () => {
    await expect(checkRequestUrl('http://localhost:3128/api/first-party-apps/polls/interactions', { env: devEnv })).resolves.toMatchObject({ ok: true })
    await expect(checkRequestUrl('http://localhost:9999/x', { env: devEnv })).resolves.toMatchObject({ ok: false })
    await expect(checkRequestUrl('http://localhost:3128/x', { env: { ...devEnv, NODE_ENV: 'production' } })).resolves.toMatchObject({ ok: false })
    await expect(checkRequestUrl('http://localhost:3128/x', { env: { ...devEnv, VERCEL_ENV: 'preview' } })).resolves.toMatchObject({ ok: false })
    await expect(checkRequestUrl('http://localhost:3128/x', { env: { ...devEnv, APP_PLATFORM_ALLOW_LOOPBACK_REQUEST_URL: 'false' } })).resolves.toMatchObject({ ok: false })
  })
})

describe('公開されていないアドレスの判定', () => {
  it.each([
    '10.1.2.3', '127.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '::1', '::', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', 'ff02::1',
  ])('%s は内部として扱う', (address) => {
    expect(isNonPublicAddress(address)).toBe(true)
  })

  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111'])('%s は公開として扱う', (address) => {
    expect(isNonPublicAddress(address)).toBe(false)
  })
})
