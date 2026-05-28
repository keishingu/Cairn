// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'

export async function GET() {
  const key = process.env['VAPID_PUBLIC_KEY']
  if (!key) {
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 503 })
  }
  return NextResponse.json({ publicKey: key })
}
