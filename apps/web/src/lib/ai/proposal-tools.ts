// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 書き込みの実行案を作る tool（docs/ai-automation-design.md §2.4・§5.2）。どれも実行はせず、承認カードを出すだけ。
// `/ai` は読み取り専用が原則で、Skill を呼んだときだけこれらを渡す（Phase 1 の Skill 呼び出しで接続する）。

import { tool } from 'ai'
import { z } from 'zod'
import type { AiPendingActionType } from '@cairn/db'
import type { AuthContext } from '@/lib/get-auth-context'
import { POST_MESSAGE_MAX_LENGTH, PendingActionError, proposePendingAction } from './pending-actions'

const reason = z
  .string()
  .trim()
  .max(1000)
  .nullable()
  .describe('この操作を提案する理由。承認カードに表示します。未指定ならnull')

async function propose(
  ctx: AuthContext,
  conversationId: string | null,
  actionType: AiPendingActionType,
  payload: Record<string, unknown>,
  why: string | null,
) {
  try {
    const action = await proposePendingAction(ctx, { conversationId, actionType, payload, reason: why })
    return {
      ok: true as const,
      pendingAction: { id: action.id, actionType: action.actionType, status: action.status },
      note: '承認カードを表示しました。利用者が承認するまで実行されていません。実行済みとして扱わないでください。回答本文では <@userId> の記法を使わず、メンバーを名前で書いてください。',
    }
  } catch (error) {
    if (error instanceof PendingActionError) {
      return { ok: false as const, error: { code: 'INVALID_PROPOSAL', message: error.message } }
    }
    console.error('[AI proposal tool]', error)
    return {
      ok: false as const,
      error: { code: 'PROPOSAL_FAILED', message: '実行案を作れませんでした。実行されていないものとして扱ってください。' },
    }
  }
}

export function createProposalTools(ctx: AuthContext, conversationId: string | null) {
  return {
    propose_post_message: tool({
      description:
        'チャンネルへの投稿（メンションを含む）の実行案を作り、利用者に承認カードを出します。承認されると Cairn AI として投稿し、承認者名を添えます。メンションは <@userId> の形式で本文に書いてください。',
      parameters: z.object({
        channelId: z.string().uuid().describe('list_channels等で取得したチャンネルID'),
        text: z.string().trim().min(1).max(POST_MESSAGE_MAX_LENGTH).describe('投稿する本文（Markdown）'),
        reason,
      }),
      execute: ({ channelId, text, reason: why }) =>
        propose(ctx, conversationId, 'post_message', { channelId, text }, why),
    }),

    propose_invite_project_member: tool({
      description:
        'メンバーをプロジェクトに追加する実行案を作り、承認カードを出します。役割（レビュワー等）も同時に付けられます。',
      parameters: z.object({
        projectId: z.string().uuid().describe('プロジェクトID'),
        userId: z.string().uuid().describe('追加するメンバーのユーザーID'),
        roleId: z.string().uuid().nullable().describe('付けるプロジェクトの役割のID。メンバーのままならnull'),
        reason,
      }),
      execute: ({ projectId, userId, roleId, reason: why }) =>
        propose(ctx, conversationId, 'invite_project_member', { projectId, userId, roleId }, why),
    }),

    propose_set_project_member_role: tool({
      description: 'すでにプロジェクトにいるメンバーの役割を変える実行案を作り、承認カードを出します。',
      parameters: z.object({
        projectId: z.string().uuid().describe('プロジェクトID'),
        userId: z.string().uuid().describe('対象メンバーのユーザーID'),
        roleId: z.string().uuid().describe('付けるプロジェクトの役割のID'),
        reason,
      }),
      execute: ({ projectId, userId, roleId, reason: why }) =>
        propose(ctx, conversationId, 'set_project_member_role', { projectId, userId, roleId }, why),
    }),

    propose_create_task: tool({
      description: 'タスク作成の実行案を作り、承認カードを出します。プロジェクトかチャンネルのどちらか一方に作ります。',
      parameters: z.object({
        title: z.string().trim().min(1).max(200),
        projectId: z.string().uuid().nullable().describe('プロジェクトに作るならそのID。未指定ならnull'),
        channelId: z.string().uuid().nullable().describe('チャンネルに作るならそのID。未指定ならnull'),
        description: z.string().max(2000).nullable().describe('説明。未指定ならnull'),
        priority: z.enum(['high', 'medium', 'low']),
        assigneeId: z.string().uuid().nullable().describe('担当者のユーザーID。未指定ならnull'),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe('期限（YYYY-MM-DD）。未指定ならnull'),
        reason,
      }),
      execute: ({ reason: why, ...payload }) => propose(ctx, conversationId, 'create_task', payload, why),
    }),
  }
}
