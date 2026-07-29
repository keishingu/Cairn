// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { isPlacementEligibleCredit, placementEligibleCreditReasons } from '@cairn/core/billing'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'

export interface CreditPlacementDto {
  id: string
  ledgerId: string
  x: number
  y: number
  rotation: number
  // regular は初期ボードが保存した互換用の形状。organic は現行の石積みボード。
  shape: 'regular' | 'organic'
  placedAt: string
}

export interface PendingCreditDto {
  ledgerId: string
  createdAt: string
}

export interface CreditContributionsDto {
  billingEnabled: boolean
  placements: CreditPlacementDto[]
  pending: PendingCreditDto[]
}

const createPlacementSchema = z.object({
  ledgerId: z.string().uuid(),
  x: z.number().finite().min(0.03).max(0.97),
  y: z.number().finite().min(0.03).max(0.97),
  rotation: z
    .number()
    .finite()
    .min(-Math.PI * 2)
    .max(Math.PI * 2),
  shape: z.enum(['regular', 'organic']),
})

function placementDto(row: {
  id: string
  ledgerId: string
  x: string
  y: string
  rotation: string
  shape: string
  placedAt: Date
}): CreditPlacementDto {
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    x: Number(row.x),
    y: Number(row.y),
    rotation: Number(row.rotation),
    shape: row.shape === 'organic' ? 'organic' : 'regular',
    placedAt: row.placedAt.toISOString(),
  }
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = requireRole(ctx.role, 'member')
  if (forbidden) return forbidden

  if (!isBillingEnabled()) {
    return NextResponse.json({
      billingEnabled: false,
      placements: [],
      pending: [],
    } satisfies CreditContributionsDto)
  }

  try {
    const { creditLedger, creditPlacements, db } = await import('@cairn/db')
    const { and, asc, eq, gt, inArray, isNull } = await import('drizzle-orm')
    const [placements, pending] = await Promise.all([
      db
        .select({
          id: creditPlacements.id,
          ledgerId: creditPlacements.ledgerId,
          x: creditPlacements.x,
          y: creditPlacements.y,
          rotation: creditPlacements.rotation,
          shape: creditPlacements.shape,
          placedAt: creditPlacements.placedAt,
        })
        .from(creditPlacements)
        .where(eq(creditPlacements.workspaceId, ctx.workspaceId))
        .orderBy(asc(creditPlacements.placedAt)),
      db
        .select({ id: creditLedger.id, createdAt: creditLedger.createdAt })
        .from(creditLedger)
        .leftJoin(creditPlacements, eq(creditPlacements.ledgerId, creditLedger.id))
        .where(
          and(
            eq(creditLedger.workspaceId, ctx.workspaceId),
            gt(creditLedger.delta, 0),
            inArray(creditLedger.reason, [...placementEligibleCreditReasons]),
            isNull(creditPlacements.id),
          ),
        )
        .orderBy(asc(creditLedger.createdAt)),
    ])

    return NextResponse.json({
      billingEnabled: true,
      placements: placements.map(placementDto),
      pending: pending.map((row) => ({ ledgerId: row.id, createdAt: row.createdAt.toISOString() })),
    } satisfies CreditContributionsDto)
  } catch (err) {
    console.error('[/api/billing/contributions GET]', err)
    return NextResponse.json({ error: '配置データの取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = requireRole(ctx.role, 'member')
  if (forbidden) return forbidden

  if (!isBillingEnabled()) {
    return NextResponse.json({ error: '課金機能が有効ではありません' }, { status: 404 })
  }

  const parsed = createPlacementSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '配置内容が正しくありません' }, { status: 400 })
  }

  try {
    const { creditLedger, creditPlacements, db } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')
    const [placement] = await db.transaction(async (tx) => {
      const [ledger] = await tx
        .select({ reason: creditLedger.reason, delta: creditLedger.delta })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.id, parsed.data.ledgerId),
            eq(creditLedger.workspaceId, ctx.workspaceId),
          ),
        )
        .limit(1)

      if (!ledger || !isPlacementEligibleCredit(ledger)) return []

      return tx
        .insert(creditPlacements)
        .values({
          workspaceId: ctx.workspaceId,
          ledgerId: parsed.data.ledgerId,
          placedBy: ctx.userId,
          x: String(parsed.data.x),
          y: String(parsed.data.y),
          rotation: String(parsed.data.rotation),
          shape: parsed.data.shape,
        })
        .onConflictDoNothing({ target: creditPlacements.ledgerId })
        .returning()
    })

    if (!placement) {
      return NextResponse.json(
        { error: 'このクレジットは既に配置済みか、配置できません' },
        { status: 409 },
      )
    }

    return NextResponse.json(placementDto(placement), { status: 201 })
  } catch (err) {
    console.error('[/api/billing/contributions POST]', err)
    return NextResponse.json({ error: '配置の保存に失敗しました' }, { status: 500 })
  }
}
