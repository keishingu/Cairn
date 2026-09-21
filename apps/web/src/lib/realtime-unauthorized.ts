// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export function isRealtimeUnauthorized(error: unknown): boolean {
  if (typeof error === 'string') return /unauthorized/i.test(error)
  if (!error || typeof error !== 'object' || !('message' in error)) return false
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && /unauthorized/i.test(message)
}
