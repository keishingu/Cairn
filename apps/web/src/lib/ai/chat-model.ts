// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { isAiChatModel, type AiChatModel } from '@cairn/shared'
import { BILLING_CONFIG } from '@cairn/core/billing'

export interface WorkspaceChatModels {
  // 新しい会話の既定モデル
  defaultModel: AiChatModel
  // メンバーが会話ごとに選べるモデル
  allowedModels: AiChatModel[]
}

// DB の CHECK 制約で保証される値。壊れていても既定のモデルへ黙って置き換えず、エラーにする
export function parseWorkspaceChatModels(row: { aiChatModel: string; aiChatAllowedModels: string[] }): WorkspaceChatModels {
  if (!isAiChatModel(row.aiChatModel)) throw new Error(`Invalid workspaces.ai_chat_model: ${row.aiChatModel}`)
  if (row.aiChatAllowedModels.length === 0 || !row.aiChatAllowedModels.every(isAiChatModel)) {
    throw new Error(`Invalid workspaces.ai_chat_allowed_models: ${row.aiChatAllowedModels.join(',')}`)
  }
  return { defaultModel: row.aiChatModel, allowedModels: row.aiChatAllowedModels }
}

export async function loadWorkspaceChatModels(workspaceId: string): Promise<WorkspaceChatModels> {
  const { db, workspaces } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const [row] = await db
    .select({ aiChatModel: workspaces.aiChatModel, aiChatAllowedModels: workspaces.aiChatAllowedModels })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
  if (!row) throw new Error(`Workspace not found: ${workspaceId}`)
  return parseWorkspaceChatModels(row)
}

// 会話のモデル。null は会話ごとのモデルを持つ前の会話で、ワークスペースの既定モデルを使う
export function resolveConversationModel(stored: string | null, models: WorkspaceChatModels): AiChatModel {
  if (stored === null) return models.defaultModel
  if (!isAiChatModel(stored)) throw new Error(`Invalid ai_conversations.model: ${stored}`)
  return stored
}

// /ai の1依頼で消費するクレジット
export function chatRequestCredits(model: AiChatModel): number {
  return BILLING_CONFIG.aiChatRequestCreditsByModel[model]
}
