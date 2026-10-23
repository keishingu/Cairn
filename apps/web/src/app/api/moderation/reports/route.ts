// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { isModerator } from '@/lib/safety/moderator'

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  if (!(await isModerator(ctx.userId))) return NextResponse.json({ error: 'この操作には運営者権限が必要です' }, { status: 403 })
  const { db, contentReports } = await import('@cairn/db')
  const { desc } = await import('drizzle-orm')
  const rows = await db.select({ id: contentReports.id, workspaceId: contentReports.workspaceId, channelId: contentReports.channelId, messageId: contentReports.messageId, reason: contentReports.reason, status: contentReports.status, contentSnapshot: contentReports.contentSnapshot, createdAt: contentReports.createdAt, resolvedAt: contentReports.resolvedAt })
    .from(contentReports).orderBy(desc(contentReports.createdAt)).limit(100)
  return NextResponse.json(rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null })))
}
