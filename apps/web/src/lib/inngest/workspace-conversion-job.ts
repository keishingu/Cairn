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

// 外部への送信は失敗したら Inngest が再試行する。どちらも同じ id / uuid を送るので二重に数えない
export const reportWorkspaceConversion = inngest.createFunction(
  { id: 'report-workspace-conversion' },
  { event: WORKSPACE_CREATED_EVENT },
  async ({ event, step }) => {
    const data = event.data as WorkspaceCreatedEventData
    const posthogConfigured = Boolean(process.env['NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN'])
    const openAiConfigured = isOpenAiAdsConfigured()
    if (!posthogConfigured && !(openAiConfigured && data.oppref)) {
      return { skipped: 'not configured' }
    }

    // 本人が最初に作ったワークスペースなら新規登録のコンバージョン
    const isFirstWorkspace = await step.run('check-first-workspace', () =>
      isFirstWorkspaceOf(data.userId, data.workspaceId),
    )

    if (posthogConfigured) {
      await step.run('capture-posthog', () => capturePostHogWorkspaceCreated(data, isFirstWorkspace))
    }

    // ChatGPT 広告は「新規登録」として送るため、初めてのワークスペースで、広告のクリックがあるときだけ
    const sendToOpenAi = openAiConfigured && Boolean(data.oppref) && isFirstWorkspace
    if (sendToOpenAi) {
      await step.run('send-openai-conversion', () => sendOpenAiConversion(data))
    }

    return { posthog: posthogConfigured, openai: sendToOpenAi }
  },
)
