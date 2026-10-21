// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { blocksRevision } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import { decryptToken } from '@/lib/token-crypto'
import { buildBlockActionsPayload, deliverToApp, newInteractionId, resolveAction } from '@/lib/apps/interactions'
import { recordDeliveryAfterResponse } from '@/lib/apps/delivery-log'
import { blocksForClient } from '@/lib/apps/blocks-for-client'
import { issueTrigger } from '@/lib/apps/triggers'

// カードのボタン押下・選択を、アプリの Request URL へ署名付きで届ける（docs/app-platform-design.md §5）。
// クライアントが送るのは「どの要素か」と select の選択肢だけ。値やラベルは保存済みの blocks から引く。
// エラーはコードで返し、文言はクライアントが表示言語で出す

const bodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('button'), messageId: z.string().uuid(), revision: z.string().max(64), blockId: z.string().min(1).max(255), actionId: z.string().min(1).max(255) }),
  z.object({
    type: z.literal('static_select'),
    messageId: z.string().uuid(),
    revision: z.string().max(64),
    blockId: z.string().min(1).max(255),
    actionId: z.string().min(1).max(255),
    selectedOptionValue: z.string().min(1).max(150),
  }),
])

function error(code: string, status: number) {
  return NextResponse.json({ error: code }, { status })
}

export async function POST(req: Request) {
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  let parsed: z.infer<typeof bodySchema>
  try {
    const result = bodySchema.safeParse(await req.json())
    if (!result.success) return error('invalid_request', 400)
    parsed = result.data
  } catch {
    return error('invalid_request', 400)
  }

  try {
    const { db, messages, messageBlocks, appInstallations, apps, channels, appChannelMemberships, workspaces, profiles, activeWorkspaceMembers } =
      await import('@cairn/db')
    const { and, eq, inArray, isNull } = await import('drizzle-orm')

    const [row] = await db
      .select({
        messageId: messages.id,
        channelId: messages.channelId,
        content: messages.content,
        senderId: messages.senderId,
        blocks: messageBlocks.blocks,
        installationId: appInstallations.id,
        installationWorkspaceId: appInstallations.workspaceId,
        installationRevokedAt: appInstallations.revokedAt,
        appId: apps.id,
        requestUrl: apps.requestUrl,
        signingSecretEncrypted: apps.signingSecretEncrypted,
        channelName: channels.name,
        parentChannelId: channels.parentChannelId,
      })
      .from(messages)
      .innerJoin(messageBlocks, eq(messageBlocks.messageId, messages.id))
      .innerJoin(appInstallations, eq(appInstallations.id, messageBlocks.installationId))
      .innerJoin(apps, eq(apps.id, appInstallations.appId))
      .innerJoin(channels, eq(channels.id, messages.channelId))
      .where(and(eq(messages.id, parsed.messageId), isNull(messages.deletedAt)))
      .limit(1)

    // 別ワークスペースのカードは存在しないものとして扱う
    if (!row || row.installationWorkspaceId !== ctx.workspaceId) return error('message_not_found', 404)

    const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, row.channelId, ctx.role)
    if (forbidden) return forbidden

    if (row.installationRevokedAt) return error('app_uninstalled', 409)

    // Bot がチャンネルから外された後の古いカードは配送しない。票だけ commit されて chat.update が not_in_channel になり、
    // 表示とずれるのを防ぐ（§5.1）
    const memberChannelIds = row.parentChannelId ? [row.channelId, row.parentChannelId] : [row.channelId]
    const [membership] = await db
      .select({ channelId: appChannelMemberships.channelId })
      .from(appChannelMemberships)
      .where(and(eq(appChannelMemberships.installationId, row.installationId), inArray(appChannelMemberships.channelId, memberChannelIds)))
      .limit(1)
    if (!membership) return error('app_not_in_channel', 409)

    // 押されたのが今のカードか確かめる。chat.update の後に古いカードが押されたら、同じ ID の新しい値で届けない
    if (blocksRevision(blocksForClient(row.blocks)) !== parsed.revision) return error('card_changed', 409)
    const resolved = resolveAction(row.blocks, parsed)
    if (!resolved.ok) return error(resolved.error, 422)
    if (!row.requestUrl || !row.signingSecretEncrypted) return error('app_not_interactive', 409)

    const [[workspace], [member]] = await Promise.all([
      db.select({ slug: workspaces.slug }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId)).limit(1),
      db
        .select({ name: workspaceMemberDisplayName(activeWorkspaceMembers.displayName, profiles.displayName) })
        .from(profiles)
        .leftJoin(activeWorkspaceMembers, and(eq(activeWorkspaceMembers.userId, profiles.id), eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId)))
        .where(eq(profiles.id, ctx.userId))
        .limit(1),
    ])
    // 認証の後にワークスペースや利用者が消えていたら、空の名前で署名付きの操作を届けない（別人・削除済みとして処理させない）
    if (!workspace || !member) return error('user_not_found', 404)

    const interactionId = newInteractionId()
    // アプリがこの押下からモーダルを開けるよう、押した本人に結びついた trigger_id を渡す。
    // 発行できなくても（デプロイ直後でマイグレーションが未適用など）既存のボタン操作は止めない。その場合 views.open は invalid_trigger_id になる
    const triggerId = await issueTrigger({ installationId: row.installationId, userId: ctx.userId, channelId: row.channelId }).catch((err: unknown) => {
      console.error('[/api/app-interactions] failed to issue trigger_id:', err)
      return ''
    })
    const payload = buildBlockActionsPayload(
      {
        workspace: { id: ctx.workspaceId, slug: workspace.slug },
        user: { id: ctx.userId, name: member.name },
        appId: row.appId,
        channel: { id: row.channelId, name: row.channelName },
        message: { id: row.messageId, text: row.content, botProfileId: row.senderId, installationId: row.installationId, blocks: row.blocks },
        action: resolved.action,
        triggerId,
      },
      interactionId,
    )

    const delivery = await deliverToApp({
      requestUrl: row.requestUrl,
      signingSecret: decryptToken(row.signingSecretEncrypted),
      payload,
    })

    recordDeliveryAfterResponse({ installationId: row.installationId, userId: ctx.userId, type: 'block_actions', actionId: parsed.actionId, delivery })

    if (delivery.status !== 'delivered') {
      console.warn(`[/api/app-interactions] delivery ${delivery.status}:`, delivery.error)
      return error(delivery.status === 'timeout' ? 'app_timeout' : 'app_unreachable', 502)
    }
    return NextResponse.json({ ok: true, interactionId })
  } catch (err) {
    console.error('[/api/app-interactions POST] failed:', err)
    return error('internal_error', 500)
  }
}
