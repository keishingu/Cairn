// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { inngest } from './client'
import { isOpenAiAdsConfigured } from '@/lib/analytics/ad-click'
import {
  capturePostHogWorkspaceCreated,
  sendOpenAiConversion,
  WORKSPACE_CREATED_EVENT,
  type WorkspaceCreatedEventData,
} from '@/lib/analytics/workspace-conversion'

/**
 * 本人が作った中で最も古いワークスペースかを、保存された作成順で判定する。
 * 処理時点の作成数で判定すると、処理が遅れている間に2つ目を作られたとき1つ目も「初回でない」になる
 */
export async function isFirstWorkspaceOf(userId: string, workspaceId: string): Promise<boolean> {
  const { db, workspaces } = await import('@cairn/db')
  const { asc, eq } = await import('drizzle-orm')
  const [first] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.createdBy, userId))
    .orderBy(asc(workspaces.createdAt), asc(workspaces.id))
    .limit(1)
  if (!first) throw new Error(`workspace ${workspaceId} created by ${userId} was not found`)
  return first.id === workspaceId
}

// 送信先ごとに関数を分け、片方が再試行を使い切って失敗しても、もう片方は送られるようにする。
// 失敗したら Inngest が再試行する。どちらも固定の id / uuid を送るので二重に数えない

export const reportWorkspaceConversionToPostHog = inngest.createFunction(
  { id: 'report-workspace-conversion-posthog' },
  { event: WORKSPACE_CREATED_EVENT },
  async ({ event, step }) => {
    const data = event.data as WorkspaceCreatedEventData
    if (!process.env['NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN']) return { skipped: 'not configured' }

    const isFirstWorkspace = await step.run('check-first-workspace', () =>
      isFirstWorkspaceOf(data.userId, data.workspaceId),
    )
    await step.run('capture-posthog', () => capturePostHogWorkspaceCreated(data, isFirstWorkspace))
    return { sent: true, isFirstWorkspace }
  },
)

// ChatGPT 広告には「新規登録」として送るため、広告のクリックがあり、初めてのワークスペースのときだけ
export const reportWorkspaceConversionToOpenAi = inngest.createFunction(
  { id: 'report-workspace-conversion-openai' },
  { event: WORKSPACE_CREATED_EVENT },
  async ({ event, step }) => {
    const data = event.data as WorkspaceCreatedEventData
    if (!isOpenAiAdsConfigured()) return { skipped: 'not configured' }
    if (!data.oppref) return { skipped: 'not from ChatGPT ad' }

    const isFirstWorkspace = await step.run('check-first-workspace', () =>
      isFirstWorkspaceOf(data.userId, data.workspaceId),
    )
    if (!isFirstWorkspace) return { skipped: 'not first workspace' }

    await step.run('send-openai-conversion', () => sendOpenAiConversion(data))
    return { sent: true }
  },
)
