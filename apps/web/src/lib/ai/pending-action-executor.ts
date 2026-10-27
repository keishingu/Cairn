// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 承認された実行案を、承認者のリクエストの中で実行する（docs/ai-automation-design.md §2.4）。
// プロジェクト・タスクの操作は画面と同じ Route Handler を呼び、承認者の認可・検証・通知をそのまま通す。
// Route Handler は next/headers から認証情報を読むため、承認 API のリクエスト内で呼べば承認者として動く。

import type { MessageBlock } from '@cairn/shared'
import { translate } from '@cairn/shared'
import { POST as addProjectMemberRoute } from '@/app/api/projects/[id]/members/route'
import { PATCH as setProjectMemberRoleRoute } from '@/app/api/projects/[id]/members/[userId]/route'
import { POST as createTaskRoute } from '@/app/api/tasks/route'
import { ensureFirstPartyInstallations } from '@/lib/apps/first-party'
import { isChannelArchived } from '@/lib/apps/channel-apps'
import { chatPostMessage } from '@/lib/apps/web-api/chat'
import type { AuthContext } from '@/lib/get-auth-context'
import { readRequestLocale } from '@/lib/i18n/request-locale'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import { APP_SCOPES } from '@cairn/db'
import {
  PendingActionError,
  assertCanApproveChannelPost,
  type PendingActionExecutor,
  type PendingActionPayload,
} from './pending-actions'

const CAIRN_AI_SLUG = 'ai'

async function routeOutcome(response: Response, fallback: string): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (response.ok) return body ?? {}
  const error = body?.['error']
  // 画面と同じ API のエラー文をそのまま承認カードに出す（権限不足・既に参加済みなど）
  const message = typeof error === 'string' ? error : fallback
  throw new PendingActionError(
    response.status === 403 ? 403 : response.status === 404 ? 404 : response.status === 409 ? 409 : 422,
    message,
  )
}

async function cairnAiBot(workspaceId: string) {
  await ensureFirstPartyInstallations(workspaceId)
  const { appInstallations, apps, db } = await import('@cairn/db')
  const { and, eq, isNull } = await import('drizzle-orm')
  const [installation] = await db
    .select({ installationId: appInstallations.id, appId: apps.id, botProfileId: appInstallations.botProfileId })
    .from(appInstallations)
    .innerJoin(apps, eq(apps.id, appInstallations.appId))
    .where(
      and(
        eq(apps.slug, CAIRN_AI_SLUG),
        isNull(apps.ownerWorkspaceId),
        eq(appInstallations.workspaceId, workspaceId),
        isNull(appInstallations.revokedAt),
      ),
    )
    .limit(1)
  if (!installation) throw new PendingActionError(409, 'このワークスペースでは Cairn AI が利用できません')
  return {
    tokenId: '',
    installationId: installation.installationId,
    appId: installation.appId,
    workspaceId,
    botProfileId: installation.botProfileId,
    scopes: [...APP_SCOPES],
  }
}

async function approverName(ctx: AuthContext): Promise<string> {
  const { db, profiles, workspaceMembers } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [row] = await db
    .select({ name: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName) })
    .from(profiles)
    .leftJoin(
      workspaceMembers,
      and(eq(workspaceMembers.userId, profiles.id), eq(workspaceMembers.workspaceId, ctx.workspaceId)),
    )
    .where(eq(profiles.id, ctx.userId))
    .limit(1)
  return row?.name ?? ''
}

/**
 * Cairn AI をチャンネルへ追加する（承認者の操作として監査ログに残す）。Bot はアプリ基盤と同じく、
 * 参加しているチャンネルにしか投稿できない（docs/app-platform-design.md §3.3）
 */
async function ensureBotInChannel(ctx: AuthContext, installationId: string, channelId: string) {
  const { appChannelMemberships, auditLogs, channels, db } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const [channel] = await db
    .select({ type: channels.type, archivedAt: channels.archivedAt, parentChannelId: channels.parentChannelId })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)
  if (!channel || channel.type === 'dm' || (await isChannelArchived(channel))) {
    throw new PendingActionError(422, 'このチャンネルには投稿できません（DM・アーカイブ済み）')
  }
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(appChannelMemberships)
      .values({ installationId, channelId, workspaceId: ctx.workspaceId, addedBy: ctx.userId })
      .onConflictDoNothing()
      .returning({ channelId: appChannelMemberships.channelId })
    if (inserted.length > 0) {
      await tx.insert(auditLogs).values({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        entityType: 'app_channel_membership',
        entityId: installationId,
        action: 'add',
        payload: { channelId, reason: 'ai_pending_action' },
      })
    }
  })
}

/** 投稿するカード。本文は AI の提案（承認時の編集を反映）、補足に承認者を出す（承認者の名義では投稿しない。§2.4） */
export function approvedPostBlocks(text: string, approver: string, locale: Parameters<typeof translate>[0]): MessageBlock[] {
  return [
    { type: 'markdown', text },
    {
      type: 'context',
      elements: [{ type: 'plain_text', text: translate(locale, 'Approved by {name}', { name: approver }) }],
    },
  ] as MessageBlock[]
}

async function postMessage(ctx: AuthContext, actionId: string, payload: PendingActionPayload<'post_message'>) {
  await assertCanApproveChannelPost(ctx, payload.channelId)
  const bot = await cairnAiBot(ctx.workspaceId)
  await ensureBotInChannel(ctx, bot.installationId, payload.channelId)
  const { locale } = await readRequestLocale()
  const result = await chatPostMessage(bot, {
    channel: payload.channelId,
    // メンション通知は本文（代替テキスト）の canonical なメンションから届く
    text: payload.text,
    blocks: JSON.stringify(approvedPostBlocks(payload.text, await approverName(ctx), locale)),
    // 実行案の ID を投稿 ID にして、同じ実行案から二重に投稿しない
    client_msg_id: actionId,
  })
  if (!result.ok) {
    throw new PendingActionError(422, `投稿できませんでした（${String((result as { error?: unknown }).error)}）`)
  }
  return { messageId: actionId, channelId: payload.channelId }
}

export const executePendingAction: PendingActionExecutor = async (ctx, action) => {
  switch (action.actionType) {
    case 'post_message':
      return postMessage(ctx, action.id, action.payload as PendingActionPayload<'post_message'>)
    case 'invite_project_member': {
      const payload = action.payload as PendingActionPayload<'invite_project_member'>
      const response = await addProjectMemberRoute(
        new Request(`http://cairn.local/api/projects/${payload.projectId}/members`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userId: payload.userId, ...(payload.roleId ? { roleId: payload.roleId } : {}) }),
        }),
        { params: Promise.resolve({ id: payload.projectId }) },
      )
      await routeOutcome(response, 'プロジェクトへの追加に失敗しました')
      return { projectId: payload.projectId, userId: payload.userId }
    }
    case 'set_project_member_role': {
      const payload = action.payload as PendingActionPayload<'set_project_member_role'>
      const response = await setProjectMemberRoleRoute(
        new Request(`http://cairn.local/api/projects/${payload.projectId}/members/${payload.userId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ roleId: payload.roleId }),
        }),
        { params: Promise.resolve({ id: payload.projectId, userId: payload.userId }) },
      )
      await routeOutcome(response, 'プロジェクトの役割の変更に失敗しました')
      return { projectId: payload.projectId, userId: payload.userId, roleId: payload.roleId }
    }
    case 'create_task': {
      const payload = action.payload as PendingActionPayload<'create_task'>
      const body = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null))
      const response = await createTaskRoute(
        new Request('http://cairn.local/api/tasks', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
      const created = await routeOutcome(response, 'タスクの作成に失敗しました')
      const taskId = typeof created['id'] === 'string' ? created['id'] : null
      return { taskId }
    }
  }
}
