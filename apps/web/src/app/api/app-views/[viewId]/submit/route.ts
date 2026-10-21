// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { BLOCKS_SCHEMA_VERSION, prepareModalView } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { decryptToken } from '@/lib/token-crypto'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import { findOpenAppView } from '@/lib/apps/app-views'
import { deliverToApp, newInteractionId } from '@/lib/apps/interactions'
import { issueTrigger } from '@/lib/apps/triggers'
import { parseViewSubmissionResponse, validateSubmission } from '@/lib/apps/view-submission'

// モーダルの送信。入力値をサーバーで検証してから Slack と同じ view_submission をアプリへ届け、
// アプリの同期応答（response_action）に従って、エラー表示・差し替え・閉じるのどれかにする（docs/app-platform-design.md §5.5）

const bodySchema = z.object({
  values: z.record(z.string().max(255), z.record(z.string().max(255), z.string().max(3000).nullable())),
})

export async function POST(req: Request, { params }: { params: Promise<{ viewId: string }> }) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const { viewId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(viewId)) return NextResponse.json({ error: 'view_not_found' }, { status: 404 })

  let values: z.infer<typeof bodySchema>['values']
  try {
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    values = parsed.data.values
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  try {
    const view = await findOpenAppView({ viewId, userId: ctx.userId, workspaceId: ctx.workspaceId })
    if (!view) return NextResponse.json({ error: 'view_not_found' }, { status: 404 })
    if (!view.requestUrl || !view.signingSecretEncrypted) return NextResponse.json({ error: 'app_not_interactive' }, { status: 409 })

    const validated = validateSubmission(view.view, values)
    if (!validated.ok) return NextResponse.json({ status: 'errors', errors: validated.errors }, { status: 422 })

    const { db, appViews, appInteractionDeliveries, workspaces, profiles, activeWorkspaceMembers } = await import('@cairn/db')
    const { and, eq, sql } = await import('drizzle-orm')
    const [[workspace], [member]] = await Promise.all([
      db.select({ slug: workspaces.slug }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId)).limit(1),
      db
        .select({ name: workspaceMemberDisplayName(activeWorkspaceMembers.displayName, profiles.displayName) })
        .from(profiles)
        .leftJoin(activeWorkspaceMembers, and(eq(activeWorkspaceMembers.userId, profiles.id), eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId)))
        .where(eq(profiles.id, ctx.userId))
        .limit(1),
    ])

    const interactionId = newInteractionId()
    const triggerId = await issueTrigger({ installationId: view.installationId, userId: ctx.userId, channelId: view.channelId })
    const stored = view.view as Record<string, unknown>
    const payload = {
      type: 'view_submission',
      team: { id: ctx.workspaceId, domain: workspace?.slug ?? '' },
      user: { id: ctx.userId, name: member?.name ?? '', team_id: ctx.workspaceId },
      api_app_id: view.appId,
      token: '',
      trigger_id: triggerId,
      view: {
        ...stored,
        id: view.id,
        hash: view.hash,
        team_id: ctx.workspaceId,
        app_id: view.appId,
        bot_id: view.installationId,
        state: { values: validated.values },
      },
      cairn: { interaction_id: interactionId, channel_id: view.channelId },
    }

    const delivery = await deliverToApp({ requestUrl: view.requestUrl, signingSecret: decryptToken(view.signingSecretEncrypted), payload })
    await db.insert(appInteractionDeliveries).values({
      installationId: view.installationId,
      userId: ctx.userId,
      type: 'view_submission',
      actionId: typeof stored['callback_id'] === 'string' ? stored['callback_id'] : null,
      status: delivery.status,
      httpStatus: delivery.httpStatus,
      durationMs: delivery.durationMs,
      error: delivery.status === 'delivered' ? null : delivery.error.slice(0, 500),
    })
    if (delivery.status !== 'delivered') {
      // モーダルは開いたままにして、入力を失わせない
      return NextResponse.json({ error: delivery.status === 'timeout' ? 'app_timeout' : 'app_unreachable' }, { status: 502 })
    }

    const response = parseViewSubmissionResponse(delivery.body)
    if (response.action === 'errors') return NextResponse.json({ status: 'errors', errors: response.errors }, { status: 422 })
    if (response.action === 'update') {
      const prepared = prepareModalView(response.view)
      if (!prepared.ok) {
        console.warn('[/api/app-views submit] app returned an invalid view:', prepared.errors)
        return NextResponse.json({ error: 'app_invalid_response' }, { status: 502 })
      }
      await db
        .update(appViews)
        .set({ view: prepared.value, hash: `${Date.now()}.${interactionId.slice(0, 8)}`, schemaVersion: BLOCKS_SCHEMA_VERSION, updatedAt: sql`clock_timestamp()` })
        .where(and(eq(appViews.id, viewId), eq(appViews.status, 'open')))
      return NextResponse.json({ status: 'updated' })
    }
    await db.update(appViews).set({ status: 'submitted' }).where(and(eq(appViews.id, viewId), eq(appViews.status, 'open')))
    return NextResponse.json({ status: 'closed' })
  } catch (err) {
    console.error('[/api/app-views/[viewId]/submit POST] failed:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
