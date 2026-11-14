// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  capturePostHogWorkspaceCreated,
  sendOpenAiConversion,
  type WorkspaceCreatedEventData,
} from './workspace-conversion'

const data: WorkspaceCreatedEventData = {
  workspaceId: '11111111-2222-4333-8444-555555555555',
  userId: 'user-1',
  createdAtMs: 1_762_700_000_000,
  client: 'web',
  oppref: 'op-ref-value',
  sourceUrl: 'https://oss-cairn.com/onboarding',
}

function okFetch() {
  return vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
}

describe('sendOpenAiConversion', () => {
  afterEach(() => vi.unstubAllEnvs())

  test('Pixel ID と Bearer キーで、oppref をそのまま新規登録として送る', async () => {
    vi.stubEnv('OPENAI_ADS_PIXEL_ID', 'pixel-1')
    vi.stubEnv('OPENAI_ADS_CONVERSIONS_API_KEY', 'capi-key')
    const fetchImpl = okFetch()

    await sendOpenAiConversion(data, fetchImpl)

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://bzr.openai.com/v1/events?pid=pixel-1')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer capi-key' })
    expect(JSON.parse(init.body as string)).toEqual({
      events: [
        {
          id: `workspace_created:${data.workspaceId}`,
          type: 'registration_completed',
          timestamp_ms: data.createdAtMs,
          oppref: 'op-ref-value',
          action_source: 'web',
          source_url: 'https://oss-cairn.com/onboarding',
          data: { type: 'customer_action' },
        },
      ],
    })
  })

  test('失敗したら再試行できるよう例外にする', async () => {
    vi.stubEnv('OPENAI_ADS_PIXEL_ID', 'pixel-1')
    vi.stubEnv('OPENAI_ADS_CONVERSIONS_API_KEY', 'capi-key')
    const fetchImpl = vi.fn().mockResolvedValue(new Response('bad', { status: 400 }))

    await expect(sendOpenAiConversion(data, fetchImpl)).rejects.toThrow('400 bad')
  })

  test('設定が無ければ送らずに例外にする', async () => {
    vi.stubEnv('OPENAI_ADS_PIXEL_ID', '')
    const fetchImpl = okFetch()
    await expect(sendOpenAiConversion(data, fetchImpl)).rejects.toThrow('OPENAI_ADS_PIXEL_ID')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('capturePostHogWorkspaceCreated', () => {
  afterEach(() => vi.unstubAllEnvs())

  test('user ID を distinct_id、ワークスペース ID を uuid にして送る', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://eu.i.posthog.com/')
    const fetchImpl = okFetch()

    await capturePostHogWorkspaceCreated(data, true, fetchImpl)

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://eu.i.posthog.com/i/v0/e/')
    expect(JSON.parse(init.body as string)).toEqual({
      api_key: 'phc_test',
      event: 'workspace_created',
      distinct_id: 'user-1',
      timestamp: new Date(data.createdAtMs).toISOString(),
      uuid: data.workspaceId,
      properties: {
        workspace_id: data.workspaceId,
        client: 'web',
        is_first_workspace: true,
        from_chatgpt_ad: true,
      },
    })
  })
})
