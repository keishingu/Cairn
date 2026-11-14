// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import { getStripeClient, resolveApplicationUrl } from '@/lib/billing/stripe'

export async function POST(request: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: 'この環境では請求機能を利用できません' }, { status: 404 })
  }

  try {
    const { billingCustomers, db } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')
    const [customer] = await db
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, ctx.userId))
      .limit(1)
    if (!customer) {
      return NextResponse.json({ error: '管理できる購読が見つかりません' }, { status: 404 })
    }

    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: `${resolveApplicationUrl(request)}/settings/billing`,
    })
    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[/api/billing/portal POST]', err)
    return NextResponse.json({ error: '請求管理画面の準備に失敗しました' }, { status: 500 })
  }
}
