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

// 送信を確保しておく時間。アプリへの配信（3秒）と前後の DB 操作が収まる長さにする
const SUBMIT_LEASE_SECONDS = 15

const bodySchema = z.object({
  // 描いていた版。views.update で中身が変わった後の古い入力を、新しい版の意味で解釈しない
  hash: z.string().min(1).max(255),
  values: z.record(z.string().max(255), z.record(z.string().max(255), z.string().max(3000).nullable())),
})

export async function POST(req: Request, { params }: { params: Promise<{ viewId: string }> }) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const { viewId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(viewId)) return NextResponse.json({ error: 'view_not_found' }, { status: 404 })

  let values: z.infer<typeof bodySchema>['values']
  let renderedHash: string
  try {
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    values = parsed.data.values
    renderedHash = parsed.data.hash
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  try {
    const view = await findOpenAppView({ viewId, userId: ctx.userId, workspaceId: ctx.workspaceId })
    if (!view) return NextResponse.json({ error: 'view_not_found' }, { status: 404 })
    if (view.hash !== renderedHash) return NextResponse.json({ error: 'view_changed' }, { status: 409 })
    if (!view.requestUrl || !view.signingSecretEncrypted) return NextResponse.json({ error: 'app_not_interactive' }, { status: 409 })

    const validated = validateSubmission(view.view, values)
    if (!validated.ok) return NextResponse.json({ status: 'errors', errors: validated.errors }, { status: 422 })

    const { db, appViews, appInteractionDeliveries, workspaces, profiles, activeWorkspaceMembers } = await import('@cairn/db')
    const { and, eq, isNull, lt, or, sql } = await import('drizzle-orm')

    // 届ける前に、この版のモーダルの送信を1つだけ確保する。同時に押された2つ目は届けない
    const [claimed] = await db
      .update(appViews)
      .set({ submittingUntil: sql`now() + make_interval(secs => ${SUBMIT_LEASE_SECONDS})` })
      .where(
        and(
          eq(appViews.id, viewId),
          eq(appViews.status, 'open'),
          eq(appViews.hash, renderedHash),
          or(isNull(appViews.submittingUntil), lt(appViews.submittingUntil, sql`now()`)),
        ),
      )
      .returning({ id: appViews.id })
    if (!claimed) return NextResponse.json({ error: 'view_submitting' }, { status: 409 })
    // モーダルを開いたまま返すときは確保を外し、直して送り直せるようにする
    const release = () => db.update(appViews).set({ submittingUntil: null }).where(eq(appViews.id, viewId))
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

    let delivery: Awaited<ReturnType<typeof deliverToApp>>
    try {
      delivery = await deliverToApp({ requestUrl: view.requestUrl, signingSecret: decryptToken(view.signingSecretEncrypted), payload })
    } catch (err) {
      await release()
      throw err
    }
    // 配送の記録は運用のためのもの。記録だけ失敗しても、アプリが処理した結果を利用者へ返す
    await db
      .insert(appInteractionDeliveries)
      .values({
        installationId: view.installationId,
        userId: ctx.userId,
        type: 'view_submission',
        actionId: typeof stored['callback_id'] === 'string' ? stored['callback_id'] : null,
        status: delivery.status,
        httpStatus: delivery.httpStatus,
        durationMs: delivery.durationMs,
        error: delivery.status === 'delivered' ? null : delivery.error.slice(0, 500),
      })
      .catch((err: unknown) => console.error('[/api/app-views submit] failed to record delivery:', err))
    if (delivery.status !== 'delivered') {
      // モーダルは開いたままにして、入力を失わせない
      await release()
      return NextResponse.json({ error: delivery.status === 'timeout' ? 'app_timeout' : 'app_unreachable' }, { status: 502 })
    }

    const response = parseViewSubmissionResponse(delivery.body)
    if (response.action === 'errors') {
      await release()
      return NextResponse.json({ status: 'errors', errors: response.errors }, { status: 422 })
    }
    if (response.action === 'update') {
      const prepared = prepareModalView(response.view)
      if (!prepared.ok) {
        console.warn('[/api/app-views submit] app returned an invalid view:', prepared.errors)
        await release()
        return NextResponse.json({ error: 'app_invalid_response' }, { status: 502 })
      }
      await db
        .update(appViews)
        .set({
          view: prepared.value,
          hash: `${Date.now()}.${interactionId.slice(0, 8)}`,
          schemaVersion: BLOCKS_SCHEMA_VERSION,
          submittingUntil: null,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(and(eq(appViews.id, viewId), eq(appViews.status, 'open')))
      return NextResponse.json({ status: 'updated' })
    }
    await db.update(appViews).set({ status: 'submitted', submittingUntil: null }).where(and(eq(appViews.id, viewId), eq(appViews.status, 'open')))
    return NextResponse.json({ status: 'closed' })
  } catch (err) {
    console.error('[/api/app-views/[viewId]/submit POST] failed:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
