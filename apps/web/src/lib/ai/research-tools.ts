// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { tool } from 'ai'
import { z } from 'zod'
import type { AuthContext } from '@/lib/get-auth-context'
import {
  ResearchAccessError,
  ResearchInputError,
  getResearchRiskSnapshot,
  listResearchProjects,
  listResearchProjectTasks,
  searchResearchChannelMessages,
  searchResearchDocuments,
} from './workspace-research'
import {
  getResearchMemberHistory,
  getResearchProjectMembers,
  listResearchChannels,
  listResearchMembers,
  listResearchProjectRoles,
  readResearchChannelMessages,
  readResearchFile,
} from './workspace-research-directory'

function toolError(error: unknown) {
  const expected = error instanceof ResearchAccessError || error instanceof ResearchInputError
  console.error('[AI research tool]', error)
  return {
    ok: false as const,
    error: {
      code: expected ? error.code : 'QUERY_FAILED',
      message: expected
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
  .describe('希望件数。サーバー側の上限を超えた値は自動的に切り詰めます')

const nullableRequestedLimit = requestedLimit.nullable()

export function createResearchTools(ctx: AuthContext) {
  return {
    list_projects: tool({
      description:
        '権限内のプロジェクトを列挙し、期限・メンバー数・未完了/期限超過タスク数を確認します。横断調査では最初に使用してください。',
      parameters: z.object({
        includeArchived: z.boolean().nullable().describe('アーカイブ済みを含めるか。既定はfalse。指定しない場合はnull'),
        limit: nullableRequestedLimit.describe('指定しない場合はnull'),
      }),
      execute: ({ includeArchived, limit }) =>
        safely(() =>
          listResearchProjects(ctx, {
            includeArchived: includeArchived ?? undefined,
            limit: limit ?? undefined,
          }),
        ),
    }),

    list_project_tasks: tool({
      description:
        '権限内の指定プロジェクトのタスクを取得します。重要なプロジェクトの期限、停滞、未アサインを深掘りするときに使用してください。',
      parameters: z.object({
        projectId: z.string().uuid().describe('list_projects等で取得したプロジェクトID'),
        filters: z
          .array(z.enum(['overdue', 'due_soon', 'stalled', 'unassigned']))
          .nullable()
          .describe('複数指定はOR。未指定ならnull'),
        limit: nullableRequestedLimit.describe('指定しない場合はnull'),
      }),
      execute: ({ projectId, filters, limit }) =>
        safely(() =>
          listResearchProjectTasks(ctx, {
            projectId,
            filters: filters ?? undefined,
            limit: limit ?? undefined,
          }),
        ),
    }),

    get_project_risk_snapshot: tool({
      description:
        '権限内の構造化データから期限超過、期限間近の未着手、7日超の停滞、未アサイン、終了間近の未完了多数を決定論的に一括検出します。',
      parameters: z.object({
        includeArchived: z.boolean().nullable().describe('アーカイブ済みを含めるか。既定はfalse。指定しない場合はnull'),
      }),
      execute: ({ includeArchived }) =>
        safely(() => getResearchRiskSnapshot(ctx, { includeArchived: includeArchived ?? undefined })),
    }),

    search_channel_messages: tool({
      description:
        '権限内の非DMチャンネルを時系列で検索します。未回答依頼、未決議論、認識齟齬、スコープ膨張の根拠が必要な場合だけ使用してください。',
      parameters: z.object({
        query: z.string().trim().max(200).nullable().describe('任意の部分一致検索語。未指定ならnull'),
        projectId: z.string().uuid().nullable().describe('対象プロジェクトを限定。未指定ならnull'),
        channelId: z.string().uuid().nullable().describe('対象チャンネルを限定。未指定ならnull'),
        lookbackDays: z
          .number()
          .int()
          .positive()
          .nullable()
          .describe('遡る日数。既定30日、サーバー上限90日。未指定ならnull'),
        limit: nullableRequestedLimit.describe('指定しない場合はnull'),
      }),
      execute: ({ query, projectId, channelId, lookbackDays, limit }) =>
        safely(() =>
          searchResearchChannelMessages(ctx, {
            query: query || undefined,
            projectId: projectId ?? undefined,
            channelId: channelId ?? undefined,
            lookbackDays: lookbackDays ?? undefined,
            limit: limit ?? undefined,
          }),
        ),
    }),

    search_workspace_documents: tool({
      description:
        '既存RAGを追加の検索語で再検索し、権限内のファイル・プロジェクト・メンバー情報を根拠付きで取得します。必要な場合だけ使用してください。',
      parameters: z.object({
        query: z.string().trim().min(1).max(500).describe('追加で調べる検索語'),
        limit: nullableRequestedLimit.describe('指定しない場合はnull'),
      }),
      execute: ({ query, limit }) =>
        safely(() => searchResearchDocuments(ctx, { query, limit: limit ?? undefined })),
    }),

    list_channels: tool({
      description:
        '権限内の非DMチャンネル（ワークスペース・プロジェクト・スレッド）を名前やプロジェクトで探します。チャンネルを探す・一覧するとき、名前が曖昧なときに使います。名前が分かっていて読むだけなら、これを呼ばずread_channel_messagesにchannelNameを渡してください。',
      parameters: z.object({
        query: z.string().trim().max(100).nullable().describe('チャンネル名またはプロジェクト名の部分一致。先頭の#は無視。未指定ならnull'),
        projectId: z.string().uuid().nullable().describe('対象プロジェクトを限定。未指定ならnull'),
        includeArchived: z.boolean().nullable().describe('アーカイブ済みスレッドを含めるか。既定はfalse。指定しない場合はnull'),
        limit: nullableRequestedLimit.describe('指定しない場合はnull'),
      }),
      execute: ({ query, projectId, includeArchived, limit }) =>
        safely(() =>
          listResearchChannels(ctx, {
            query: query || undefined,
            projectId: projectId ?? undefined,
            includeArchived: includeArchived ?? undefined,
            limit: limit ?? undefined,
          }),
        ),
    }),

    read_channel_messages: tool({
      description:
        '権限内の1チャンネルのメッセージを期間指定で古い順に読みます。「昨日以降の投稿」のように期間で読むとき、会話の流れを追うときに使います。「#審議」のようにチャンネル名が分かっているときは、list_channelsを先に呼ばずchannelNameを渡してこのtoolを直接呼んでください（同名が複数あるとき・見つからないときはエラーで候補を返します）。名前が曖昧・不明なときだけlist_channelsで探します。channelIdとchannelNameはどちらか一方だけ指定します。truncatedがtrueならnextCursorを渡して続きを読んでください。',
      parameters: z.object({
        channelId: z.string().uuid().nullable().describe('list_channels等で取得したチャンネルID（スレッドのIDも可）。channelNameを使うならnull'),
        channelName: z.string().trim().min(1).max(100).nullable().describe('チャンネル名の完全一致。先頭の#は無視。channelIdを使うならnull'),
        since: z.string().datetime({ offset: true }).nullable().describe('この日時より後の投稿（ISO 8601）。未指定なら30日前。cursor指定時は無視'),
        until: z.string().datetime({ offset: true }).nullable().describe('この日時以前の投稿（ISO 8601）。未指定なら現在'),
        cursor: z.string().max(100).nullable().describe('前回のnextCursor。未指定ならnull'),
        limit: nullableRequestedLimit.describe('指定しない場合はnull'),
      }),
      execute: ({ channelId, channelName, since, until, cursor, limit }) =>
        safely(() =>
          readResearchChannelMessages(ctx, {
            channelId: channelId ?? undefined,
            channelName: channelName ?? undefined,
            since: since ?? undefined,
            until: until ?? undefined,
            cursor: cursor ?? undefined,
            limit: limit ?? undefined,
          }),
        ),
    }),

    list_project_roles: tool({
      description:
        'ワークスペースで使うプロジェクトの役割（リーダー・レビュワー等）と、そのIDを一覧します。役割を付ける実行案には、ここで取得した役割IDを使ってください。',
      parameters: z.object({}),
      execute: () => safely(() => listResearchProjectRoles(ctx)),
    }),

    get_project_members: tool({
      description:
        '権限内のプロジェクトの参加者と、プロジェクトの役割（リーダー・レビュワー等）・出欠・プロフィール属性を取得します。',
      parameters: z.object({
        projectId: z.string().uuid().describe('list_projects等で取得したプロジェクトID'),
      }),
      execute: ({ projectId }) => safely(() => getResearchProjectMembers(ctx, { projectId })),
    }),

    list_members: tool({
      description:
        '利用者に見えるワークスペースのメンバーを、プロフィール属性（例: 「コーチ」「3年生」）付きで一覧します。属性名で絞り込めます。',
      parameters: z.object({
        query: z.string().trim().max(100).nullable().describe('表示名の部分一致。未指定ならnull'),
        attributeNames: z
          .array(z.string().trim().min(1).max(20))
          .nullable()
          .describe('このいずれかのプロフィール属性を持つメンバーに絞る（完全一致・OR）。未指定ならnull'),
        includeInactive: z.boolean().nullable().describe('非活性メンバーを含めるか（admin以上のみ有効）。既定はfalse。指定しない場合はnull'),
        limit: nullableRequestedLimit.describe('指定しない場合はnull'),
      }),
      execute: ({ query, attributeNames, includeInactive, limit }) =>
        safely(() =>
          listResearchMembers(ctx, {
            query: query || undefined,
            attributeNames: attributeNames ?? undefined,
            includeInactive: includeInactive ?? undefined,
            limit: limit ?? undefined,
          }),
        ),
    }),

    get_member_history: tool({
      description:
        'メンバーの経歴（参加プロジェクト・プロジェクトの役割・期間・ステータス・各プロジェクトの添付ファイル）を最大50人まとめて取得します。対象はuserIds、またはattributeNames（プロフィール属性。完全一致・OR）・projectRoleNames（プロジェクトの役割名。完全一致・OR）で指定でき、IDが分からなくてもlist_membersを先に呼ばずに「コーチ全員」「リーダー経験者」のようにこのtoolを直接1回呼んで経歴の比較表を作れます。attributeNamesとprojectRoleNamesを両方指定すると両方を満たす人、userIdsも指定するとその中の該当者に絞ります。フィルタ指定では非活性メンバーは含みません。list_membersは、属性名や氏名が分からないとき・メンバーの一覧自体が欲しいときだけ使います。添付ファイルは参加者ごとではなくprojectFilesにプロジェクト単位で1回だけ入ります。1プロジェクトあたりの件数は返すプロジェクト数に応じて10〜50件（新しい順）で、appliedFilters.maxFilesPerProjectが今回の上限、filesTruncatedがtrueなら古いファイルが残っています。添付ファイルの本文はread_fileで読みます。',
      parameters: z.object({
        userIds: z.array(z.string().uuid()).nullable().describe('list_members等で取得したユーザーID。最大50人（超えた分は返さずtruncatedになります）。属性・役割で絞るならnull'),
        attributeNames: z
          .array(z.string().trim().min(1).max(20))
          .nullable()
          .describe('このいずれかのプロフィール属性（例: 「コーチ」「3年生」）を持つメンバーに絞る（完全一致・OR）。未指定ならnull'),
        projectRoleNames: z
          .array(z.string().trim().min(1).max(50))
          .nullable()
          .describe('見えるプロジェクトのいずれかでこの役割名（例: 「リーダー」「コーチ」）を持つメンバーに絞る（完全一致・OR）。未指定ならnull'),
        includeFiles: z.boolean().nullable().describe('各プロジェクトの添付ファイル一覧を含めるか。既定はtrue。指定しない場合はnull'),
      }),
      execute: ({ userIds, attributeNames, projectRoleNames, includeFiles }) =>
        safely(() =>
          getResearchMemberHistory(ctx, {
            userIds: userIds ?? undefined,
            attributeNames: attributeNames ?? undefined,
            projectRoleNames: projectRoleNames ?? undefined,
            includeFiles: includeFiles ?? undefined,
          }),
        ),
    }),

    read_file: tool({
      description:
        '権限内の添付ファイル（振り返り資料・計画書など）の抽出済み本文をチャンク単位で読みます。nextStartChunkがあれば続きを読めます。',
      parameters: z.object({
        fileId: z.string().uuid().describe('get_member_historyやsearch_workspace_documentsで取得したファイルID'),
        startChunk: z.number().int().min(0).nullable().describe('読み始めるチャンク番号。既定は0。指定しない場合はnull'),
        limit: nullableRequestedLimit.describe('読むチャンク数。サーバー上限10。指定しない場合はnull'),
      }),
      execute: ({ fileId, startChunk, limit }) =>
        safely(() =>
          readResearchFile(ctx, {
            fileId,
            startChunk: startChunk ?? undefined,
            limit: limit ?? undefined,
          }),
        ),
    }),
  }
}
