// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * ユーザーの未読アプリ内通知の総数を返す（全ワークスペース横断）。
 *
 * OS のアプリアイコンに付くバッジ（Badging API）は端末単位・アプリ単位で
 * ワークスペースの概念を持たないため、バッジ用のカウントはワークスペースで
 * 絞らず本人宛の未読通知すべてを合算する。
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const { db, notifications } = await import('@cairn/db')
  const { eq, and, isNull, count } = await import('drizzle-orm')

  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))

  return row?.n ?? 0
}
