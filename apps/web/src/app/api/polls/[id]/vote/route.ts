// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { votePollSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = votePollSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { id } = await params

  try {
    const { db, pollOptions, polls, pollVotes } = await import('@cairn/db')
    const { and, eq, or } = await import('drizzle-orm')

    const [poll] = await db
      .select({
        id: polls.id,
        channelId: polls.channelId,
        allowMultiple: polls.allowMultiple,
        messageId: polls.messageId,
      })
      .from(polls)
      .where(or(eq(polls.id, id), eq(polls.messageId, id)))

    if (!poll) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
    }

    const forbidden = await requireChannelAccess(
      ctx.workspaceId,
      ctx.userId,
      poll.channelId,
    )
    if (forbidden) return forbidden

    if (!poll.allowMultiple && parsed.data.optionIds.length > 1) {
      return NextResponse.json(
        { error: '単一選択の投票では 1 つだけ選択できます' },
        { status: 422 },
      )
    }

    const options = await db
      .select({ id: pollOptions.id })
      .from(pollOptions)
      .where(eq(pollOptions.pollId, poll.id))
    const validOptionIds = new Set(options.map(option => option.id))

    if (parsed.data.optionIds.some(optionId => !validOptionIds.has(optionId))) {
      return NextResponse.json(
        { error: 'この投票に存在しない選択肢が含まれています' },
        { status: 422 },
      )
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(pollVotes)
        .where(and(eq(pollVotes.pollId, poll.id), eq(pollVotes.userId, ctx.userId)))

      if (parsed.data.optionIds.length === 0) return

      await tx
        .insert(pollVotes)
        .values(
          parsed.data.optionIds.map(optionId => ({
            pollId: poll.id,
            optionId,
            userId: ctx.userId,
            allowMultiple: poll.allowMultiple,
          })),
        )
    })

    return NextResponse.json({ id: poll.id, optionIds: parsed.data.optionIds })
  } catch (err) {
    console.error('[/api/polls/[id]/vote POST] DB query failed:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
