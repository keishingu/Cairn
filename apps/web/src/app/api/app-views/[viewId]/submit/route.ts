// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { BLOCKS_SCHEMA_VERSION, prepareModalView } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { resolveBotChannel } from '@/lib/apps/web-api/channel-access'
import { decryptToken } from '@/lib/token-crypto'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import { findOpenAppView } from '@/lib/apps/app-views'
import { deliverToApp, newInteractionId } from '@/lib/apps/interactions'
import { recordDeliveryAfterResponse } from '@/lib/apps/delivery-log'
import { issueTrigger } from '@/lib/apps/triggers'
import { displayableErrors, parseViewSubmissionResponse, validateSubmission } from '@/lib/apps/view-submission'

// モーダルの送信。入力値をサーバーで検証してから Slack と同じ view_submission をアプリへ届け、
// アプリの同期応答（response_action）に従って、エラー表示・差し替え・閉じるのどれかにする（docs/app-platform-design.md §5.5）

// 送信を確保しておく時間。DB の query_timeout（30秒）とアプリへの配信（3秒）より長くする。
// それでも届ける直前に確保がまだ自分のものかを確かめる（期限切れの間に別の送信が確保していたら届けない）
const SUBMIT_LEASE_SECONDS = 45

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
    if (view.channelId) {
      // モーダルは開いたまま残り得る。送る時点で、送信者がまだそのチャンネルを見られ、アプリがまだ投稿できるかを確かめる
      // （外された人に Bot 経由で投稿させない・アーカイブ済みへの投稿を閉じた後に失敗させ続けない）
      const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, view.channelId, ctx.role)
      if (forbidden) return NextResponse.json({ error: 'channel_unavailable' }, { status: 403 })
      const botChannel = await resolveBotChannel({ workspaceId: ctx.workspaceId, installationId: view.installationId }, view.channelId)
      if (!botChannel.ok) return NextResponse.json({ error: 'channel_unavailable' }, { status: 409 })
    }
    if (!view.requestUrl || !view.signingSecretEncrypted) return NextResponse.json({ error: 'app_not_interactive' }, { status: 409 })

    const validated = validateSubmission(view.view, values)
    if (!validated.ok) return NextResponse.json({ status: 'errors', errors: validated.errors }, { status: 422 })

    const { db, appViews, workspaces, profiles, activeWorkspaceMembers } = await import('@cairn/db')
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
      .returning({ lease: sql<string>`${appViews.submittingUntil}::text` })
    if (!claimed) return NextResponse.json({ error: 'view_submitting' }, { status: 409 })
    // 確保の値そのものを自分の確保の印にする（別の送信が取り直すと値が変わる）
    let lease = claimed.lease
    const ownsLease = sql`${appViews.submittingUntil}::text = ${lease}`
    // モーダルを開いたまま返すときは確保を外し、直して送り直せるようにする。外すのは自分の確保だけ
    const release = () => db.update(appViews).set({ submittingUntil: null }).where(and(eq(appViews.id, viewId), sql`${appViews.submittingUntil}::text = ${lease}`))
    const [[workspace], [member]] = await Promise.all([
      db.select({ slug: workspaces.slug }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId)).limit(1),
      db
        .select({ name: workspaceMemberDisplayName(activeWorkspaceMembers.displayName, profiles.displayName) })
        .from(profiles)
        .leftJoin(activeWorkspaceMembers, and(eq(activeWorkspaceMembers.userId, profiles.id), eq(activeWorkspaceMembers.workspaceId, ctx.workspaceId)))
        .where(eq(profiles.id, ctx.userId))
        .limit(1),
    ])
    // 認証の後にワークスペースや利用者が消えていたら、空の名前で署名付きの送信を届けない
    if (!workspace || !member) {
      await release()
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
    }

    const interactionId = newInteractionId()
    // trigger_id は発行から6秒。発行の後は届ける直前の確認（UPDATE 1回）だけを挟む
    const triggerId = await issueTrigger({ installationId: view.installationId, userId: ctx.userId, channelId: view.channelId })
    const stored = view.view as Record<string, unknown>
    const payload = {
      type: 'view_submission',
      team: { id: ctx.workspaceId, domain: workspace.slug },
      user: { id: ctx.userId, name: member.name, team_id: ctx.workspaceId },
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

    // 届ける直前（ここより後に DB 操作を挟まない）に確かめる。ここまでの DB 操作が遅れて確保が切れ、別の送信が取り直していたら、同じ送信を二重に届けない。
    // 確保の間にアプリが views.update で差し替えていたら（hash が変わる）、古い版の意味で届けない。どちらでもなければ確保を延ばす
    const [renewed] = await db
      .update(appViews)
      .set({ submittingUntil: sql`now() + make_interval(secs => ${SUBMIT_LEASE_SECONDS})` })
      .where(and(eq(appViews.id, viewId), eq(appViews.status, 'open'), eq(appViews.hash, renderedHash), ownsLease))
      .returning({ lease: sql<string>`${appViews.submittingUntil}::text` })
    if (!renewed) {
      const [current] = await db.select({ hash: appViews.hash }).from(appViews).where(eq(appViews.id, viewId)).limit(1)
      if (current && current.hash !== renderedHash) {
        await release()
        return NextResponse.json({ error: 'view_changed' }, { status: 409 })
      }
      return NextResponse.json({ error: 'view_submitting' }, { status: 409 })
    }
    lease = renewed.lease

    let delivery: Awaited<ReturnType<typeof deliverToApp>>
    try {
      delivery = await deliverToApp({ requestUrl: view.requestUrl, signingSecret: decryptToken(view.signingSecretEncrypted), payload })
    } catch (err) {
      await release()
      throw err
    }
    recordDeliveryAfterResponse({
      installationId: view.installationId,
      userId: ctx.userId,
      type: 'view_submission',
      actionId: typeof stored['callback_id'] === 'string' ? stored['callback_id'] : null,
      delivery,
    })
    if (delivery.status !== 'delivered') {
      // モーダルは開いたままにして、入力を失わせない
      await release()
      return NextResponse.json({ error: delivery.status === 'timeout' ? 'app_timeout' : 'app_unreachable' }, { status: 502 })
    }

    const response = parseViewSubmissionResponse(delivery.body)
    if (response.action === 'invalid') {
      console.warn('[/api/app-views submit] app returned an unreadable response')
      await release()
      return NextResponse.json({ error: 'app_invalid_response' }, { status: 502 })
    }
    if (response.action === 'errors') {
      await release()
      const errors = displayableErrors(view.view, response.errors)
      if (!errors) {
        console.warn('[/api/app-views submit] app returned errors for no input of this view:', Object.keys(response.errors))
        return NextResponse.json({ error: 'app_invalid_response' }, { status: 502 })
      }
      return NextResponse.json({ status: 'errors', errors }, { status: 422 })
    }
    if (response.action === 'update') {
      const prepared = prepareModalView(response.view)
      if (!prepared.ok) {
        console.warn('[/api/app-views submit] app returned an invalid view:', prepared.errors)
        await release()
        return NextResponse.json({ error: 'app_invalid_response' }, { status: 502 })
      }
      // 届けている間の views.update と競合したら、先に確定したアプリの差し替えを残す
      const [updated] = await db
        .update(appViews)
        .set({
          view: prepared.value,
          hash: `${Date.now()}.${interactionId.slice(0, 8)}`,
          schemaVersion: BLOCKS_SCHEMA_VERSION,
          submittingUntil: null,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(and(eq(appViews.id, viewId), eq(appViews.status, 'open'), eq(appViews.hash, renderedHash)))
        .returning({ id: appViews.id })
      // 先に差し替えられていたら、この送信の確保を外す（新しい版をすぐ送れるようにする）
      if (!updated) await release()
      return NextResponse.json({ status: 'updated' })
    }
    // 送信を届けている間にアプリが views.update で差し替えていたら（hash が変わる）、その差し替えを黙って捨てて閉じない
    const [submitted] = await db
      .update(appViews)
      .set({ status: 'submitted', submittingUntil: null })
      .where(and(eq(appViews.id, viewId), eq(appViews.status, 'open'), eq(appViews.hash, renderedHash)))
      .returning({ id: appViews.id })
    if (!submitted) {
      await release()
      return NextResponse.json({ status: 'updated' })
    }
    return NextResponse.json({ status: 'closed' })
  } catch (err) {
    console.error('[/api/app-views/[viewId]/submit POST] failed:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
