// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { postMessageSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { getMessages } from './get-messages'
import { postMessage } from './post-message'
export type { MessageDto, ReactionDto, ReplyToDto } from './dto'

type RouteContext = { params: Promise<{ channelId: string }> }

export async function GET(req: Request, { params }: RouteContext) {
  const { channelId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
  if (forbidden) return forbidden

  return getMessages({
    channelId,
    requestUrl: req.url,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  })
}

export async function POST(req: Request, { params }: RouteContext) {
  const { channelId } = await params
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
  if (forbidden) return forbidden

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = postMessageSchema.safeParse({ ...(body as object), channelId })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  return postMessage({
    channelId,
    payload: parsed.data,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    role: ctx.role,
  })
}
