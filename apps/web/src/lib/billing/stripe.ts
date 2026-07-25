// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import Stripe from 'stripe'

export function getStripeClient(): Stripe {
  const secretKey = process.env['STRIPE_SECRET_KEY']
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not configured')
  return new Stripe(secretKey)
}

export function getIndividualSubscriptionPriceId(): string {
  const priceId = process.env['STRIPE_INDIVIDUAL_PRICE_ID']
  if (!priceId) throw new Error('STRIPE_INDIVIDUAL_PRICE_ID is not configured')
  return priceId
}

export function resolveApplicationUrl(request: Request): string {
  if (process.env['APP_URL']) return process.env['APP_URL'].replace(/\/$/, '')
  return new URL(request.url).origin
}

export function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}
