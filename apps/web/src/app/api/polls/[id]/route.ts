// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'

type RouteContext = { params: Promise<{ id: string }> }

export interface PollOptionDto {
  id: string
  text: string
  displayOrder: number
  voteCount: number
  voters: Array<{ userId: string; displayName: string }>
}

export interface PollDetailDto {
  id: string
  channelId: string
  messageId: string
  question: string
  allowMultiple: boolean
  anonymous: boolean
  createdBy: string
  createdAt: string
  selectedOptionIds: string[]
  options: PollOptionDto[]
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  const { id } = await params

  try {
    const { db, pollOptions, polls, pollVotes, profiles, workspaceMembers } =
      await import('@cairn/db')
    const { eq, and, inArray, or } = await import('drizzle-orm')

    const [poll] = await db
      .select({
        id: polls.id,
        channelId: polls.channelId,
        messageId: polls.messageId,
        question: polls.question,
        allowMultiple: polls.allowMultiple,
        anonymous: polls.anonymous,
        createdBy: polls.createdBy,
        createdAt: polls.createdAt,
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

    const [options, votes] = await Promise.all([
      db
        .select({
          id: pollOptions.id,
          text: pollOptions.text,
          displayOrder: pollOptions.displayOrder,
        })
        .from(pollOptions)
        .where(eq(pollOptions.pollId, poll.id))
        .orderBy(pollOptions.displayOrder),
      db
        .select({
          optionId: pollVotes.optionId,
          userId: pollVotes.userId,
        })
        .from(pollVotes)
        .where(eq(pollVotes.pollId, poll.id)),
    ])

    const voterMap = new Map<string, string>()
    if (!poll.anonymous && votes.length > 0) {
      const voterRows = await db
        .select({
          userId: profiles.id,
          displayName: workspaceMemberDisplayName(
            workspaceMembers.displayName,
            profiles.displayName,
          ),
        })
        .from(profiles)
        .leftJoin(
          workspaceMembers,
          and(
            eq(workspaceMembers.userId, profiles.id),
            eq(workspaceMembers.workspaceId, ctx.workspaceId),
          ),
        )
        .where(inArray(profiles.id, [...new Set(votes.map((v) => v.userId))]))

      for (const voter of voterRows)
        voterMap.set(voter.userId, voter.displayName)
    }

    return NextResponse.json({
      id: poll.id,
      channelId: poll.channelId,
      messageId: poll.messageId,
      question: poll.question,
      allowMultiple: poll.allowMultiple,
      anonymous: poll.anonymous,
      createdBy: poll.createdBy,
      createdAt: poll.createdAt.toISOString(),
      selectedOptionIds: votes
        .filter((vote) => vote.userId === ctx.userId)
        .map((vote) => vote.optionId),
      options: options.map((option) => {
        const optionVotes = votes.filter((v) => v.optionId === option.id)
        return {
          id: option.id,
          text: option.text,
          displayOrder: option.displayOrder,
          voteCount: optionVotes.length,
          voters: poll.anonymous
            ? []
            : optionVotes.map((v) => ({
                userId: v.userId,
                displayName: voterMap.get(v.userId) ?? '不明',
              })),
        }
      }),
    } satisfies PollDetailDto)
  } catch (err) {
    console.error('[/api/polls/[id] GET] DB query failed:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
