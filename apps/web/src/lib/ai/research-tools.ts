// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { tool } from 'ai'
import { z } from 'zod'
import type { AuthContext } from '@/lib/get-auth-context'
import {
  ResearchAccessError,
  getResearchRiskSnapshot,
  listResearchProjects,
  listResearchProjectTasks,
  searchResearchChannelMessages,
  searchResearchDocuments,
} from './workspace-research'

function toolError(error: unknown) {
  const accessDenied = error instanceof ResearchAccessError
  console.error('[AI research tool]', error)
  return {
    ok: false as const,
    error: {
      code: accessDenied ? error.code : 'QUERY_FAILED',
      message: accessDenied
        ? error.message
        : '調査データの取得に失敗しました。この範囲は調査できなかったものとして扱ってください。',
    },
  }
}
async function safely<T>(read: () => Promise<T>): Promise<T | ReturnType<typeof toolError>> {
  try {
    return await read()
  } catch (error) {
    return toolError(error)
  }
}

const requestedLimit = z
  .number()
  .int()
  .positive()
  .optional()
  .describe('希望件数。サーバー側の上限を超えた値は自動的に切り詰めます')

export function createResearchTools(ctx: AuthContext) {
  return {
    list_projects: tool({
      description:
        '権限内のプロジェクトを列挙し、期限・メンバー数・未完了/期限超過タスク数を確認します。横断調査では最初に使用してください。',
      parameters: z.object({
        includeArchived: z.boolean().optional().describe('アーカイブ済みを含めるか。既定はfalse'),
        limit: requestedLimit,
      }),
      execute: (input) => safely(() => listResearchProjects(ctx, input)),
    }),

    list_project_tasks: tool({
      description:
        '権限内の指定プロジェクトのタスクを取得します。重要なプロジェクトの期限、停滞、未アサインを深掘りするときに使用してください。',
      parameters: z.object({
        projectId: z.string().uuid().describe('list_projects等で取得したプロジェクトID'),
        filters: z
          .array(z.enum(['overdue', 'due_soon', 'stalled', 'unassigned']))
          .optional()
          .describe('複数指定はOR。未指定なら全タスク'),
        limit: requestedLimit,
      }),
      execute: (input) => safely(() => listResearchProjectTasks(ctx, input)),
    }),

    get_project_risk_snapshot: tool({
      description:
        '権限内の構造化データから期限超過、期限間近の未着手、7日超の停滞、未アサイン、終了間近の未完了多数を決定論的に一括検出します。',
      parameters: z.object({
        includeArchived: z.boolean().optional().describe('アーカイブ済みを含めるか。既定はfalse'),
      }),
      execute: (input) => safely(() => getResearchRiskSnapshot(ctx, input)),
    }),

    search_channel_messages: tool({
      description:
        '権限内の非DMチャンネルを時系列で検索します。未回答依頼、未決議論、認識齟齬、スコープ膨張の根拠が必要な場合だけ使用してください。',
      parameters: z.object({
        query: z.string().trim().max(200).optional().describe('任意の部分一致検索語。未指定なら期間内の最近の会話'),
        projectId: z.string().uuid().optional().describe('対象プロジェクトを限定'),
        channelId: z.string().uuid().optional().describe('対象チャンネルを限定'),
        lookbackDays: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('遡る日数。既定30日、サーバー上限90日'),
        limit: requestedLimit,
      }),
      execute: (input) => safely(() => searchResearchChannelMessages(ctx, input)),
    }),

    search_workspace_documents: tool({
      description:
        '既存RAGを追加の検索語で再検索し、権限内のファイル・プロジェクト・メンバー情報を根拠付きで取得します。必要な場合だけ使用してください。',
      parameters: z.object({
        query: z.string().trim().min(1).max(500).describe('追加で調べる検索語'),
        limit: requestedLimit,
      }),
      execute: (input) => safely(() => searchResearchDocuments(ctx, input)),
    }),
  }
}
