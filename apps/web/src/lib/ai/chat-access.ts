// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { canUseAiChat, isAiChatAccessLevel, type AiChatAccessLevel } from '@cairn/shared'
import type { AuthContext } from '@/lib/get-auth-context'

const DENIED_MESSAGE: Record<Exclude<AiChatAccessLevel, 'member'>, string> = {
  owner: 'このワークスペースでは、AIアシスタントはオーナーだけが利用できます。',
  admin: 'このワークスペースでは、AIアシスタントは管理者以上（owner・admin）だけが利用できます。',
}

/**
 * /ai（AIチャット）を使えるかをワークスペースの設定（owner が決める）とロールで判定する。
 * 使えなければ 403、設定が読めない・不正なら 500 の応答を返し、使えるなら null を返す。
 * UI でも入口を隠すが、サーバー側のこの判定が正（AGENTS.md の権限の規約）
 */
export async function requireAiChatAccess(ctx: Pick<AuthContext, 'workspaceId' | 'role'>): Promise<NextResponse | null> {
  const { db, workspaces } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const [workspace] = await db
    .select({ aiChatAccess: workspaces.aiChatAccess })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspaceId))
    .limit(1)
  // CHECK 制約で守られる値。読めない・不正なときは全員に許可へ黙って戻さず、エラーにする
  if (!workspace || !isAiChatAccessLevel(workspace.aiChatAccess)) {
    console.error('[ai chat access] invalid workspaces.ai_chat_access', workspace?.aiChatAccess)
    return NextResponse.json({ error: 'ワークスペースの AI アシスタントの設定を読み込めませんでした' }, { status: 500 })
  }
  const level = workspace.aiChatAccess
  if (canUseAiChat(ctx.role, level)) return null
  return NextResponse.json({ error: DENIED_MESSAGE[level as Exclude<AiChatAccessLevel, 'member'>] }, { status: 403 })
}
