// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { decryptToken, encryptToken } from './token-crypto'
import { refreshAccessToken } from './google-calendar-api'

export interface SelectedCalendar {
  id: string
  name: string
  color: string
}

export interface GcalAccountMeta {
  googleAccountEmail: string
  selectedCalendars: SelectedCalendar[]
  lastSyncedAt?: string
}

export interface GcalAccount {
  id: string
  accessToken: string
  refreshToken: string
  expiresAt: Date | null
  meta: GcalAccountMeta
}

export async function getGcalAccount(userId: string): Promise<GcalAccount | null> {
  const { db, connectedAccounts } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')

  const [row] = await db
    .select()
    .from(connectedAccounts)
    .where(and(
      eq(connectedAccounts.userId, userId),
      eq(connectedAccounts.provider, 'google_calendar'),
    ))
    .limit(1)

  if (!row?.accessTokenEncrypted || !row.refreshTokenEncrypted) return null

  return {
    id: row.id,
    accessToken: decryptToken(row.accessTokenEncrypted),
    refreshToken: decryptToken(row.refreshTokenEncrypted),
    expiresAt: row.expiresAt,
    meta: (row.metadata as unknown as GcalAccountMeta) ?? { googleAccountEmail: '', selectedCalendars: [] },
  }
}

/** アクセストークンが5分以内に切れる場合はリフレッシュして返す */
export async function getFreshToken(account: GcalAccount): Promise<{ accessToken: string; account: GcalAccount }> {
  const hasTime = account.expiresAt && account.expiresAt.getTime() - Date.now() > 5 * 60 * 1000
  if (hasTime) return { accessToken: account.accessToken, account }

  const { accessToken, expiresIn } = await refreshAccessToken(account.refreshToken)
  const expiresAt = new Date(Date.now() + expiresIn * 1000)

  const { db, connectedAccounts } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  await db.update(connectedAccounts)
    .set({ accessTokenEncrypted: encryptToken(accessToken), expiresAt, updatedAt: new Date() })
    .where(eq(connectedAccounts.id, account.id))

  return { accessToken, account: { ...account, accessToken, expiresAt } }
}

export async function updateGcalMeta(accountId: string, meta: Partial<GcalAccountMeta>): Promise<void> {
  const { db, connectedAccounts } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')

  const [current] = await db.select({ metadata: connectedAccounts.metadata })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.id, accountId))
    .limit(1)

  const merged = { ...(current?.metadata as object ?? {}), ...meta }
  await db.update(connectedAccounts)
    .set({ metadata: merged, updatedAt: new Date() })
    .where(eq(connectedAccounts.id, accountId))
}
