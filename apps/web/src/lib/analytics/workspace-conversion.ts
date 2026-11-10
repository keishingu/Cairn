// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// ワークスペース作成のコンバージョンを PostHog と ChatGPT 広告（OpenAI Conversions API）へ送る。
// 仕様と運用は docs/ad-conversion-tracking.md。

export const WORKSPACE_CREATED_EVENT = 'workspace/created'

export type WorkspaceCreatedEventData = {
  workspaceId: string
  userId: string
  /** ワークスペースを作った時刻（Unix ms）。再試行しても変えない */
  createdAtMs: number
  client: 'web' | 'mobile'
  /** ChatGPT 広告のクリック ID。広告経由でなければ null */
  oppref: string | null
  /** 作成した画面の URL（scheme と host を含む） */
  sourceUrl: string
}

const OPENAI_CONVERSIONS_ENDPOINT = 'https://bzr.openai.com/v1/events'
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'

export function buildOpenAiConversionBody(data: WorkspaceCreatedEventData) {
  return {
    events: [
      {
        // Pixel ID・イベント名・id で重複排除されるため、再試行しても同じ id を送る
        id: `workspace_created:${data.workspaceId}`,
        type: 'registration_completed',
        timestamp_ms: data.createdAtMs,
        oppref: data.oppref,
        action_source: 'web',
        source_url: data.sourceUrl,
        data: { type: 'customer_action' },
      },
    ],
  }
}

export async function sendOpenAiConversion(
  data: WorkspaceCreatedEventData,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const pixelId = process.env['OPENAI_ADS_PIXEL_ID']
  const apiKey = process.env['OPENAI_ADS_CONVERSIONS_API_KEY']
  if (!pixelId || !apiKey) throw new Error('OPENAI_ADS_PIXEL_ID / OPENAI_ADS_CONVERSIONS_API_KEY is not set')

  const res = await fetchImpl(`${OPENAI_CONVERSIONS_ENDPOINT}?pid=${encodeURIComponent(pixelId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildOpenAiConversionBody(data)),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`OpenAI Conversions API failed: ${res.status} ${detail.slice(0, 500)}`)
  }
}

export function buildPostHogWorkspaceCreatedBody(
  token: string,
  data: WorkspaceCreatedEventData,
  isFirstWorkspace: boolean,
) {
  return {
    api_key: token,
    event: 'workspace_created',
    // ブラウザ側は Supabase の user ID で identify しているので、LP で付いた初回 UTM と同じ人物につながる
    distinct_id: data.userId,
    timestamp: new Date(data.createdAtMs).toISOString(),
    // 再試行で二重に数えないよう、ワークスペース ID（UUID）を固定の uuid として使う
    uuid: data.workspaceId,
    properties: {
      workspace_id: data.workspaceId,
      client: data.client,
      is_first_workspace: isFirstWorkspace,
      from_chatgpt_ad: Boolean(data.oppref),
    },
  }
}

export async function capturePostHogWorkspaceCreated(
  data: WorkspaceCreatedEventData,
  isFirstWorkspace: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const token = process.env['NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN']
  if (!token) throw new Error('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is not set')
  const host = (process.env['NEXT_PUBLIC_POSTHOG_HOST'] || DEFAULT_POSTHOG_HOST).replace(/\/$/, '')

  const res = await fetchImpl(`${host}/i/v0/e/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPostHogWorkspaceCreatedBody(token, data, isFirstWorkspace)),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`PostHog capture failed: ${res.status} ${detail.slice(0, 500)}`)
  }
}
