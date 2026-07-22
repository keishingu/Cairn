// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * ユーザーの未読アプリ内通知の総数を返す（全ワークスペース横断）。
 *
 * OS のアプリアイコンに付くバッジ（Badging API）は端末単位・アプリ単位で
 * ワークスペースの概念を持たないため、バッジ用のカウントはワークスペースで
 * 絞らず本人宛の未読通知すべてを合算する。
 *
 * ただし非活性化（membership_status != 'active'）されたワークスペースの通知は
 * 通常の GET/PATCH（getAuthContext 経由で active workspace にスコープ）から
 * 到達・既読化できず残り続けるため、バッジにも含めない。
 * active membership の判定は `active_workspace_members` ビュー経由に統一する
 * （CLAUDE.md: 認可目的で membership を読む処理は必ずこのビューを経由する）。
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const { aiNudges, db, notifications, activeWorkspaceMembers, workspaces } = await import('@cairn/db')
  const { eq, and, isNull, count, sql } = await import('drizzle-orm')

  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .innerJoin(
      activeWorkspaceMembers,
      and(
        eq(activeWorkspaceMembers.workspaceId, notifications.workspaceId),
        eq(activeWorkspaceMembers.userId, notifications.userId),
      ),
    )
    .where(and(
      eq(notifications.userId, userId),
      isNull(notifications.readAt),
      // 通知一覧と同様に、OFFにしたPhaseのAI通知はバッジにも含めない。
      sql`(
        ${notifications.type} <> 'ai'
        or exists (
          select 1
          from ${aiNudges}
          inner join ${workspaces} on ${aiNudges.workspaceId} = ${workspaces.id}
          where ${aiNudges.id}::text = ${notifications.data}->>'nudgeId'
            and ${aiNudges.workspaceId} = ${notifications.workspaceId}
            and ${aiNudges.userId} = ${notifications.userId}
            and (
              (${aiNudges.detector} in ('task_due_soon', 'task_overdue', 'task_stalled')
                and ${workspaces.aiNudgesPhaseOneEnabled} = true)
              or (${aiNudges.detector} in ('unanswered_ask', 'llm_risk')
                and ${workspaces.aiNudgesPhaseTwoEnabled} = true)
            )
        )
      )`,
    ))

  return row?.n ?? 0
}
