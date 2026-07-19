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
  const { db, notifications, activeWorkspaceMembers } = await import('@cairn/db')
  const { eq, and, isNull, count } = await import('drizzle-orm')

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
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))

  return row?.n ?? 0
}
