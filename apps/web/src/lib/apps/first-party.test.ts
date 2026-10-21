// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { appBaseUrl, firstPartySigningSecret, resolveRequestTarget, resolveRequestUrl } from './first-party'
import { parseEntryPoints } from './channel-apps'

const KEY = 'a'.repeat(64)

describe('ファーストパーティのアプリ', () => {
  it('Request URL はパスで持ち、送る時点で今のデプロイの URL を付ける（外部アプリの絶対 URL はそのまま）', () => {
    const env = { APP_URL: 'https://cairn.example.com/' } as unknown as NodeJS.ProcessEnv
    expect(resolveRequestUrl('/api/first-party-apps/polls/interactions', env)).toBe('https://cairn.example.com/api/first-party-apps/polls/interactions')
    expect(resolveRequestUrl('https://app.example.org/slack/events', env)).toBe('https://app.example.org/slack/events')
  })

  it('Vercel の Preview は APP_URL があってもデプロイ固有の URL を使い、本番は APP_URL を使う', () => {
    const env = { APP_URL: 'https://cairn.example.com', VERCEL_URL: 'cairn-git-x.vercel.app' }
    expect(appBaseUrl({ ...env, VERCEL_ENV: 'preview' } as unknown as NodeJS.ProcessEnv)).toBe('https://cairn-git-x.vercel.app')
    expect(appBaseUrl({ ...env, VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toBe('https://cairn.example.com')
  })

  it('APP_URL が無ければ Vercel の URL を使い、どちらも無ければ黙って空にせず例外にする', () => {
    expect(appBaseUrl({ VERCEL_URL: 'cairn-git-x.vercel.app' } as unknown as NodeJS.ProcessEnv)).toBe('https://cairn-git-x.vercel.app')
    expect(() => appBaseUrl({} as NodeJS.ProcessEnv)).toThrow('APP_URL is not configured')
  })

  it('Deployment Protection の回避ヘッダーは同じデプロイへの呼び出しにだけ付け、外部アプリへは付けない', () => {
    const env = { VERCEL_URL: 'cairn-git-x.vercel.app', VERCEL_ENV: 'preview', VERCEL_AUTOMATION_BYPASS_SECRET: 'bypass' } as unknown as NodeJS.ProcessEnv
    expect(resolveRequestTarget('/api/first-party-apps/polls/interactions', env)).toEqual({
      requestUrl: 'https://cairn-git-x.vercel.app/api/first-party-apps/polls/interactions',
      headers: { 'x-vercel-protection-bypass': 'bypass' },
    })
    expect(resolveRequestTarget('https://app.example.org/slack/events', env)).toEqual({ requestUrl: 'https://app.example.org/slack/events', headers: {} })
  })

  it('署名シークレットは暗号鍵とアプリごとに決まり、鍵が無ければ例外にする', () => {
    const env = { CALENDAR_TOKEN_ENCRYPTION_KEY: KEY } as unknown as NodeJS.ProcessEnv
    const secret = firstPartySigningSecret('polls', env)
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
    expect(firstPartySigningSecret('polls', env)).toBe(secret)
    expect(firstPartySigningSecret('polls', { CALENDAR_TOKEN_ENCRYPTION_KEY: 'b'.repeat(64) } as unknown as NodeJS.ProcessEnv)).not.toBe(secret)
    expect(secret).not.toContain(KEY)
    expect(() => firstPartySigningSecret('polls', {} as NodeJS.ProcessEnv)).toThrow()
  })

  it('壊れた起動口の定義は読み飛ばす', () => {
    expect(parseEntryPoints([{ command: '/poll', label: 'Create a poll' }, { command: 1 }, null])).toEqual([{ command: '/poll', label: 'Create a poll' }])
    expect(parseEntryPoints('x')).toEqual([])
  })
})
