// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createPollSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { inngest } from '@/lib/inngest/client'
import type { MessageCreatedEvent } from '@/lib/inngest/events'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'

export interface PollCreateResponseDto {
  id: string
  messageId: string
  channelId: string
  question: string
  allowMultiple: boolean
  anonymous: boolean
  options: Array<{ id: string; text: string; displayOrder: number }>
  createdAt: string
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createPollSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const forbidden = await requireChannelAccess(
    ctx.workspaceId,
    ctx.userId,
    parsed.data.channelId,
  )
  if (forbidden) return forbidden

  try {
    const { db, messages, pollOptions, polls, profiles, workspaceMembers } =
      await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')

    const inserted = await db.transaction(async (tx) => {
      const [message] = await tx
        .insert(messages)
        .values({
          channelId: parsed.data.channelId,
          senderId: ctx.userId,
          content: parsed.data.question,
          messageType: 'poll',
        })
        .returning({
          id: messages.id,
          createdAt: messages.createdAt,
        })

      if (!message) throw new Error('Message insert returned no rows')

      const [poll] = await tx
        .insert(polls)
        .values({
          channelId: parsed.data.channelId,
          messageId: message.id,
          question: parsed.data.question,
          allowMultiple: parsed.data.allowMultiple,
          anonymous: parsed.data.anonymous,
          createdBy: ctx.userId,
        })
        .returning({
          id: polls.id,
        })

      if (!poll) throw new Error('Poll insert returned no rows')

      const options = await tx
        .insert(pollOptions)
        .values(
          parsed.data.options.map((option, index) => ({
            pollId: poll.id,
            text: option,
            displayOrder: index,
          })),
        )
        .returning({
          id: pollOptions.id,
          text: pollOptions.text,
          displayOrder: pollOptions.displayOrder,
        })

      return {
        pollId: poll.id,
        messageId: message.id,
        createdAt: message.createdAt,
        options,
      }
    })

    const [profile] = await db
      .select({
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
      .where(eq(profiles.id, ctx.userId))

    inngest
      .send({
        name: 'message/created',
        data: {
          messageId: inserted.messageId,
          channelId: parsed.data.channelId,
          workspaceId: ctx.workspaceId,
          senderId: ctx.userId,
          senderName: profile?.displayName ?? '不明',
          content: parsed.data.question,
          attachmentFileIds: [],
        },
      } satisfies MessageCreatedEvent)
      .catch((err: unknown) => {
        console.warn(
          '[inngest] message/created send failed (Inngest not running?):',
          err,
        )
      })

    return NextResponse.json(
      {
        id: inserted.pollId,
        messageId: inserted.messageId,
        channelId: parsed.data.channelId,
        question: parsed.data.question,
        allowMultiple: parsed.data.allowMultiple,
        anonymous: parsed.data.anonymous,
        options: inserted.options,
        createdAt: inserted.createdAt.toISOString(),
      } satisfies PollCreateResponseDto,
      { status: 201 },
    )
  } catch (err) {
    console.error('[/api/polls POST] DB query failed:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
