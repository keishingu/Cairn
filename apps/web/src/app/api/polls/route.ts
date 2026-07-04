// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'

const createPollSchema = z.object({
  channelId: z.string().uuid(),
  question: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
  allowMultiple: z.boolean().optional().default(false),
  anonymous: z.boolean().optional().default(false),
  closesAt: z.string().datetime().optional(),
})

export interface CreatePollResponseDto {
  pollId: string
  messageId: string
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

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, parsed.data.channelId)
  if (forbidden) return forbidden

  try {
    const { db, messages, polls, pollOptions } = await import('@cairn/db')

    const result = await db.transaction(async (tx) => {
      const [message] = await tx
        .insert(messages)
        .values({
          channelId: parsed.data.channelId,
          senderId: ctx.userId,
          messageType: 'poll',
          content: parsed.data.question,
        })
        .returning({ id: messages.id })

      if (!message) throw new Error('Insert returned no message rows')

      const [poll] = await tx
        .insert(polls)
        .values({
          workspaceId: ctx.workspaceId,
          channelId: parsed.data.channelId,
          messageId: message.id,
          createdBy: ctx.userId,
          question: parsed.data.question,
          allowMultiple: parsed.data.allowMultiple,
          anonymous: parsed.data.anonymous,
          closesAt: parsed.data.closesAt ? new Date(parsed.data.closesAt) : null,
        })
        .returning({ id: polls.id })

      if (!poll) throw new Error('Insert returned no poll rows')

      await tx.insert(pollOptions).values(
        parsed.data.options.map((label, position) => ({
          pollId: poll.id,
          label,
          position,
        })),
      )

      return { pollId: poll.id, messageId: message.id }
    })

    return NextResponse.json(result satisfies CreatePollResponseDto, { status: 201 })
  } catch (err) {
    console.error('[/api/polls POST] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
