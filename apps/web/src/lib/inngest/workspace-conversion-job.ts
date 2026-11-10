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

async function countWorkspacesCreatedBy(userId: string): Promise<number> {
  const { db, workspaces } = await import('@cairn/db')
  const { count, eq } = await import('drizzle-orm')
  const [row] = await db.select({ n: count() }).from(workspaces).where(eq(workspaces.createdBy, userId))
  return row?.n ?? 0
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

    // 作った本人の作成数が1なら初めてのワークスペース（新規登録のコンバージョン）
    const isFirstWorkspace = await step.run('check-first-workspace', async () =>
      (await countWorkspacesCreatedBy(data.userId)) <= 1,
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
