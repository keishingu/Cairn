// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'

export interface PollOptionResultDto {
  id: string
  label: string
  position: number
  voteCount: number
  voters: Array<{ userId: string; displayName: string }>
}

export interface PollDto {
  id: string
  channelId: string
  messageId: string
  question: string
  allowMultiple: boolean
  anonymous: boolean
  closesAt: string | null
  createdAt: string
  options: PollOptionResultDto[]
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { id } = await params

  try {
    const { db, polls, pollOptions, pollVotes, profiles } = await import('@cairn/db')
    const { eq, asc, inArray } = await import('drizzle-orm')

    const [poll] = await db
      .select({
        id: polls.id,
        channelId: polls.channelId,
        messageId: polls.messageId,
        question: polls.question,
        allowMultiple: polls.allowMultiple,
        anonymous: polls.anonymous,
        closesAt: polls.closesAt,
        createdAt: polls.createdAt,
      })
      .from(polls)
      .where(eq(polls.id, id))

    if (!poll) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
    }

    const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, poll.channelId)
    if (forbidden) return forbidden

    const options = await db
      .select({
        id: pollOptions.id,
        label: pollOptions.label,
        position: pollOptions.position,
      })
      .from(pollOptions)
      .where(eq(pollOptions.pollId, poll.id))
      .orderBy(asc(pollOptions.position))

    const optionIds = options.map(option => option.id)
    const voteRows = optionIds.length > 0
      ? await db
          .select({
            optionId: pollVotes.optionId,
            userId: pollVotes.userId,
            displayName: profiles.displayName,
          })
          .from(pollVotes)
          .innerJoin(profiles, eq(pollVotes.userId, profiles.id))
          .where(inArray(pollVotes.optionId, optionIds))
      : []

    const votesByOption = new Map<string, Array<{ userId: string; displayName: string }>>()
    for (const vote of voteRows) {
      const arr = votesByOption.get(vote.optionId) ?? []
      arr.push({ userId: vote.userId, displayName: vote.displayName })
      votesByOption.set(vote.optionId, arr)
    }

    return NextResponse.json({
      id: poll.id,
      channelId: poll.channelId,
      messageId: poll.messageId,
      question: poll.question,
      allowMultiple: poll.allowMultiple,
      anonymous: poll.anonymous,
      closesAt: poll.closesAt?.toISOString() ?? null,
      createdAt: poll.createdAt.toISOString(),
      options: options.map(option => {
        const voters = votesByOption.get(option.id) ?? []
        return {
          id: option.id,
          label: option.label,
          position: option.position,
          voteCount: voters.length,
          voters: poll.anonymous ? [] : voters,
        }
      }),
    } satisfies PollDto)
  } catch (err) {
    console.error('[/api/polls/[id] GET] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
