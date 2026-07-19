// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  aiNudges,
  aiScanStates,
  channels,
  db,
  messages,
  notifications,
  profiles,
  type AiNudgeStatus,
} from '@cairn/db'
import { and, eq, gt, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { startOfJstDay } from './rules'
import {
  isUnansweredAskEligible,
  isQuietHoursInJst,
  nextJstDeliveryTime,
  passesPhaseTwoConfidence,
  PHASE_TWO_DAILY_LIMIT,
  shouldResolveDueLlmRiskReminder,
} from './phase2-rules'
import type { PhaseTwoChannelInput, PhaseTwoNudgeCandidate } from './phase2-scan'

export interface PhaseTwoScanResult {
  input: PhaseTwoChannelInput
  candidates: PhaseTwoNudgeCandidate[]
}

function notificationData(candidate: PhaseTwoNudgeCandidate, nudgeId: string) {
  return {
    nudgeId,
    channelId: candidate.channelId,
    messageId: candidate.messageId,
    ...(candidate.projectId ? { projectId: candidate.projectId } : {}),
  }
}

function mayReactivate(status: AiNudgeStatus, remindAfter: Date | null, now: Date): boolean {
  return (
    (status === 'dismissed' || status === 'suppressed') &&
    (remindAfter === null || remindAfter.getTime() <= now.getTime())
  )
}

export async function deliverPhaseTwoScanResults(results: PhaseTwoScanResult[], now = new Date()) {
  // Inngest stepの初回実行だけでなく、失敗後の再試行時刻も静寂時間帯ならDBへ触れない。
  if (isQuietHoursInJst(now)) {
    return { deferredUntil: nextJstDeliveryTime(now).toISOString() }
  }

  return db.transaction(async (tx) => {
    // 同時刻のcron再実行や静寂時間帯からの復帰が重なっても、Phase 2 の日次枠と
    // 状態遷移を一つの直列化点で決める。Phase 1 は別枠なので別lockを使う。
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ai-nudges-heartbeat-phase2'))`)

    const existingToday = await tx
      .select({ userId: aiNudges.userId })
      .from(aiNudges)
      .where(
        and(
          inArray(aiNudges.detector, ['unanswered_ask', 'llm_risk']),
          gte(aiNudges.createdAt, startOfJstDay(now)),
        ),
      )
    const deliveriesToday = new Map<string, number>()
    for (const row of existingToday) {
      deliveriesToday.set(row.userId, (deliveriesToday.get(row.userId) ?? 0) + 1)
    }

    const candidates = results
      .flatMap((result) => result.candidates)
      .filter((candidate) => passesPhaseTwoConfidence(candidate.confidence))
      .sort((a, b) => {
        if (a.detector !== b.detector) return a.detector === 'unanswered_ask' ? -1 : 1
        return b.confidence - a.confidence
      })
    const proposedTargets = new Set(
      candidates.map((candidate) => `${candidate.detector}:${candidate.messageId}:${candidate.userId}`),
    )

    let created = 0
    let reactivated = 0
    let discarded = 0

    // 直接返信はLLMに委ねず、未回答条件が解消した事実として決定論的にresolveする。
    const scannedChannelIds = [...new Set(results.map((result) => result.input.channelId))]
    const evaluatedRiskMessages = new Set(
      results
        .filter((result) => !result.input.isUnansweredAskRecheck)
        .flatMap((result) =>
          result.input.messages.map((message) => `${result.input.channelId}:${message.id}`),
        ),
    )
    const activeLlmNudges =
      scannedChannelIds.length > 0
        ? await tx
            .select({
              id: aiNudges.id,
              channelId: aiNudges.channelId,
              messageId: aiNudges.messageId,
              detector: aiNudges.detector,
              userId: aiNudges.userId,
            })
            .from(aiNudges)
            .where(
              and(
                inArray(aiNudges.detector, ['unanswered_ask', 'llm_risk']),
                eq(aiNudges.status, 'active'),
                inArray(aiNudges.channelId, scannedChannelIds),
              ),
            )
        : []
    const noLongerProposedIds = activeLlmNudges.flatMap((nudge) => {
      // unanswered_ask の解消条件は直接返信だけ。LLMが候補を省略しても消さない。
      if (nudge.detector !== 'llm_risk') return []
      if (!nudge.channelId || !nudge.messageId) return []
      if (!evaluatedRiskMessages.has(`${nudge.channelId}:${nudge.messageId}`)) return []
      return proposedTargets.has(`${nudge.detector}:${nudge.messageId}:${nudge.userId}`) ? [] : [nudge.id]
    })
    if (noLongerProposedIds.length > 0) {
      await tx
        .update(aiNudges)
        .set({ status: 'resolved' })
        .where(inArray(aiNudges.id, noLongerProposedIds))
    }

    const openUnanswered =
      scannedChannelIds.length > 0
        ? await tx
            .select({
              id: aiNudges.id,
              messageId: aiNudges.messageId,
              status: aiNudges.status,
              remindAfter: aiNudges.remindAfter,
            })
            .from(aiNudges)
            .where(
              and(
                eq(aiNudges.detector, 'unanswered_ask'),
                inArray(aiNudges.channelId, scannedChannelIds),
                inArray(aiNudges.status, ['active', 'dismissed', 'suppressed']),
              ),
            )
        : []
    const openMessageIds = openUnanswered.flatMap((row) => (row.messageId ? [row.messageId] : []))
    const answeredMessageIds =
      openMessageIds.length > 0
        ? new Set(
            (
              await tx
                .select({ parentMessageId: messages.parentMessageId })
                .from(messages)
                .where(
                  and(
                    inArray(messages.parentMessageId, openMessageIds),
                    isNull(messages.deletedAt),
                  ),
                )
            ).flatMap((row) => (row.parentMessageId ? [row.parentMessageId] : [])),
          )
        : new Set<string>()
    const resolvedIds = openUnanswered.flatMap((row) => {
      if (!row.messageId || !answeredMessageIds.has(row.messageId)) return []
      if (row.status === 'active') return [row.id]
      if (row.remindAfter === null || row.remindAfter.getTime() <= now.getTime()) return [row.id]
      return []
    })
    if (resolvedIds.length > 0) {
      await tx.update(aiNudges).set({ status: 'resolved' }).where(inArray(aiNudges.id, resolvedIds))
    }

    // 新着がないチャンネルでも later / キルスイッチ再ON後の期限到来を毎回リコンサイルする。
    const dueReminders = await tx
      .select({
        id: aiNudges.id,
        workspaceId: aiNudges.workspaceId,
        userId: aiNudges.userId,
        channelId: aiNudges.channelId,
        projectId: aiNudges.projectId,
        messageId: aiNudges.messageId,
        detector: aiNudges.detector,
        title: aiNudges.title,
        body: aiNudges.body,
        reason: aiNudges.reason,
        createdAt: aiNudges.createdAt,
      })
      .from(aiNudges)
      .where(
        and(
          inArray(aiNudges.detector, ['unanswered_ask', 'llm_risk']),
          inArray(aiNudges.status, ['dismissed', 'suppressed']),
          or(isNull(aiNudges.remindAfter), lte(aiNudges.remindAfter, now)),
        ),
      )

    for (const reminder of dueReminders) {
      const delivered = deliveriesToday.get(reminder.userId) ?? 0
      if (delivered >= PHASE_TWO_DAILY_LIMIT) {
        // 超過分を翌日に持ち越さない。既存関心事もこの配信機会で終了させる。
        await tx.update(aiNudges).set({ status: 'resolved' }).where(eq(aiNudges.id, reminder.id))
        discarded += 1
        continue
      }
      if (!reminder.channelId || !reminder.messageId) {
        await tx.update(aiNudges).set({ status: 'resolved' }).where(eq(aiNudges.id, reminder.id))
        continue
      }

      const [source] = await tx
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(
          and(
            eq(messages.id, reminder.messageId),
            eq(messages.channelId, reminder.channelId),
            isNull(messages.deletedAt),
          ),
        )
        .limit(1)
      if (!source) {
        await tx.update(aiNudges).set({ status: 'resolved' }).where(eq(aiNudges.id, reminder.id))
        continue
      }

      if (reminder.detector === 'unanswered_ask') {
        const [directReply] = await tx
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.parentMessageId, reminder.messageId), isNull(messages.deletedAt)))
          .limit(1)
        if (
          !isUnansweredAskEligible({
            messageCreatedAt: source.createdAt,
            hasDirectReply: Boolean(directReply),
            now,
          })
        ) {
          await tx.update(aiNudges).set({ status: 'resolved' }).where(eq(aiNudges.id, reminder.id))
          continue
        }
      } else {
        // リスク指摘後に会話が進んでいれば、古い文面を自動再送せず今回のLLM再評価を待つ。
        const [newerMessage] = await tx
          .select({ id: messages.id })
          .from(messages)
          .where(
            and(
              eq(messages.channelId, reminder.channelId),
              gt(messages.createdAt, reminder.createdAt),
              isNull(messages.deletedAt),
            ),
          )
          .limit(1)
        if (newerMessage) {
          const evaluatedThisRun = evaluatedRiskMessages.has(
            `${reminder.channelId}:${reminder.messageId}`,
          )
          const proposedAgain = proposedTargets.has(`llm_risk:${reminder.messageId}:${reminder.userId}`)
          if (
            shouldResolveDueLlmRiskReminder({
              hasNewerMessage: true,
              sourceEvaluated: evaluatedThisRun,
              proposedAgain,
            })
          ) {
            await tx
              .update(aiNudges)
              .set({ status: 'resolved' })
              .where(eq(aiNudges.id, reminder.id))
          }
          continue
        }
      }

      const [recipient] = await tx
        .select({
          enabled: profiles.aiNudgesEnabled,
          canAccess: sql<boolean>`public.user_can_access_ai_nudge(
            ${reminder.userId},
            ${reminder.workspaceId},
            ${reminder.channelId},
            ${reminder.projectId}
          )`,
        })
        .from(profiles)
        .where(eq(profiles.id, reminder.userId))
        .limit(1)
      if (!recipient?.enabled || !recipient.canAccess) continue

      await tx
        .update(aiNudges)
        .set({
          status: 'active',
          feedback: null,
          remindAfter: null,
          respondedAt: null,
          createdAt: now,
          reason: { ...reminder.reason, deliveredAt: now.toISOString() },
        })
        .where(eq(aiNudges.id, reminder.id))
      await tx.insert(notifications).values({
        userId: reminder.userId,
        workspaceId: reminder.workspaceId,
        type: 'ai',
        title: reminder.title,
        body: reminder.body,
        data: {
          nudgeId: reminder.id,
          channelId: reminder.channelId,
          messageId: reminder.messageId,
          ...(reminder.projectId ? { projectId: reminder.projectId } : {}),
        },
      })
      deliveriesToday.set(reminder.userId, delivered + 1)
      reactivated += 1
    }

    const seenConcerns = new Set<string>()
    const seenTargets = new Set<string>()

    for (const candidate of candidates) {
      const concern = `${candidate.userId}:${candidate.dedupeKey}`
      const target = `${candidate.detector}:${candidate.messageId}`
      if (seenConcerns.has(concern) || seenTargets.has(target)) {
        discarded += 1
        continue
      }
      seenConcerns.add(concern)
      seenTargets.add(target)

      const delivered = deliveriesToday.get(candidate.userId) ?? 0
      if (delivered >= PHASE_TWO_DAILY_LIMIT) {
        discarded += 1
        continue
      }

      // LLMが返したIDを信用せず、根拠メッセージが現在も同じチャンネルに存在することを確認する。
      const [source] = await tx
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(
          and(
            eq(messages.id, candidate.messageId),
            eq(messages.channelId, candidate.channelId),
            isNull(messages.deletedAt),
          ),
        )
        .limit(1)
      if (!source) {
        discarded += 1
        continue
      }

      if (candidate.detector === 'unanswered_ask') {
        const [directReply] = await tx
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.parentMessageId, candidate.messageId), isNull(messages.deletedAt)))
          .limit(1)
        if (
          !isUnansweredAskEligible({
            messageCreatedAt: source.createdAt,
            hasDirectReply: Boolean(directReply),
            now,
          })
        ) {
          discarded += 1
          continue
        }
      } else {
        // 静寂時間帯のsleep中に会話が進んだリスクは、古い候補を配信せず次回巡回で再評価する。
        const scanResult = results.find((result) => result.candidates.includes(candidate))
        const scannedThroughAt = scanResult
          ? new Date(scanResult.input.scannedThroughCreatedAt)
          : source.createdAt
        const [newerMessage] = await tx
          .select({ id: messages.id })
          .from(messages)
          .where(
            and(
              eq(messages.channelId, candidate.channelId),
              gt(messages.createdAt, scannedThroughAt),
              isNull(messages.deletedAt),
            ),
          )
          .limit(1)
        if (newerMessage) {
          discarded += 1
          continue
        }
      }

      // 配信直前にキルスイッチ・active membership・channel/project権限を再評価する。
      const [recipient] = await tx
        .select({
          enabled: profiles.aiNudgesEnabled,
          canAccess: sql<boolean>`public.user_can_access_ai_nudge(
            ${candidate.userId},
            ${candidate.workspaceId},
            ${candidate.channelId},
            ${candidate.projectId}
          )`,
        })
        .from(profiles)
        .where(eq(profiles.id, candidate.userId))
        .limit(1)
      if (!recipient?.enabled || !recipient.canAccess) {
        discarded += 1
        continue
      }

      const [existing] = await tx
        .select({
          id: aiNudges.id,
          status: aiNudges.status,
          remindAfter: aiNudges.remindAfter,
        })
        .from(aiNudges)
        .where(
          and(eq(aiNudges.userId, candidate.userId), eq(aiNudges.dedupeKey, candidate.dedupeKey)),
        )
        .limit(1)

      // unanswered_ask は過去runも含めて根拠メッセージにつき一人だけに固定する。
      // 宛先推定が後から変わっても別ユーザーへ追加送信しない。
      if (candidate.detector === 'unanswered_ask') {
        const [assignedElsewhere] = await tx
          .select({ id: aiNudges.id })
          .from(aiNudges)
          .where(
            and(
              eq(aiNudges.detector, 'unanswered_ask'),
              eq(aiNudges.messageId, candidate.messageId),
            ),
          )
          .limit(1)
        if (assignedElsewhere && !existing) {
          discarded += 1
          continue
        }
      }

      if (existing) {
        if (!mayReactivate(existing.status, existing.remindAfter, now)) {
          discarded += 1
          continue
        }
        await tx
          .update(aiNudges)
          .set({
            workspaceId: candidate.workspaceId,
            channelId: candidate.channelId,
            projectId: candidate.projectId,
            messageId: candidate.messageId,
            status: 'active',
            feedback: null,
            remindAfter: null,
            respondedAt: null,
            createdAt: now,
            title: candidate.title,
            body: candidate.body,
            reason: { ...candidate.reason, deliveredAt: now.toISOString() },
          })
          .where(eq(aiNudges.id, existing.id))
        await tx.insert(notifications).values({
          userId: candidate.userId,
          workspaceId: candidate.workspaceId,
          type: 'ai',
          title: candidate.title,
          body: candidate.body,
          data: notificationData(candidate, existing.id),
        })
        deliveriesToday.set(candidate.userId, delivered + 1)
        reactivated += 1
        continue
      }

      // dedupe keyが違っても、同じ detector × message に not_helpful の抑止が残る間は送らない。
      const [cooldown] = await tx
        .select({ id: aiNudges.id })
        .from(aiNudges)
        .where(
          and(
            eq(aiNudges.userId, candidate.userId),
            eq(aiNudges.detector, candidate.detector),
            eq(aiNudges.messageId, candidate.messageId),
            eq(aiNudges.status, 'suppressed'),
            gt(aiNudges.remindAfter, now),
          ),
        )
        .limit(1)
      if (cooldown) {
        discarded += 1
        continue
      }

      const [inserted] = await tx
        .insert(aiNudges)
        .values({
          workspaceId: candidate.workspaceId,
          userId: candidate.userId,
          channelId: candidate.channelId,
          projectId: candidate.projectId,
          messageId: candidate.messageId,
          detector: candidate.detector,
          dedupeKey: candidate.dedupeKey,
          title: candidate.title,
          body: candidate.body,
          reason: { ...candidate.reason, deliveredAt: now.toISOString() },
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: aiNudges.id })
      if (!inserted) {
        discarded += 1
        continue
      }
      await tx.insert(notifications).values({
        userId: candidate.userId,
        workspaceId: candidate.workspaceId,
        type: 'ai',
        title: candidate.title,
        body: candidate.body,
        data: notificationData(candidate, inserted.id),
      })
      deliveriesToday.set(candidate.userId, delivered + 1)
      created += 1
    }

    // LLM処理と配信ゲートが正常終了したチャンネルだけカーソルを進める。
    // 候補がゲートで破棄された場合も、その差分自体の評価は完了しているため前進させる。
    const existingChannelIds =
      scannedChannelIds.length > 0
        ? new Set(
            (
              await tx
                .select({ id: channels.id })
                .from(channels)
                .where(inArray(channels.id, scannedChannelIds))
            ).map((row) => row.id),
          )
        : new Set<string>()
    for (const { input } of results) {
      if (!existingChannelIds.has(input.channelId)) continue
      if (!input.advancesCursor) {
        await tx
          .update(aiScanStates)
          .set({
            nextUnansweredAskCheckAt: input.nextUnansweredAskCheckAt
              ? new Date(input.nextUnansweredAskCheckAt)
              : null,
          })
          .where(eq(aiScanStates.channelId, input.channelId))
        continue
      }
      const scannedAt = new Date(input.scannedThroughCreatedAt)
      await tx.execute(sql`
        insert into ai_scan_states (
          channel_id,
          last_scanned_message_id,
          last_scanned_at,
          next_unanswered_ask_check_at
        )
        values (
          ${input.channelId},
          ${input.scannedThroughMessageId},
          ${scannedAt},
          ${input.nextUnansweredAskCheckAt ? new Date(input.nextUnansweredAskCheckAt) : null}
        )
        on conflict (channel_id) do update
        set last_scanned_message_id = excluded.last_scanned_message_id,
            last_scanned_at = excluded.last_scanned_at,
            next_unanswered_ask_check_at = excluded.next_unanswered_ask_check_at
        where ai_scan_states.last_scanned_at < excluded.last_scanned_at
           or (
             -- 新着なしの未回答依頼再評価はカーソルが同じなので、予約時刻だけ更新を許可する。
             ai_scan_states.last_scanned_at = excluded.last_scanned_at
             and coalesce(ai_scan_states.last_scanned_message_id::text, '') <= excluded.last_scanned_message_id::text
           )
      `)
    }

    return {
      channels: results.length,
      candidates: candidates.length,
      created,
      reactivated,
      discarded,
    }
  })
}
