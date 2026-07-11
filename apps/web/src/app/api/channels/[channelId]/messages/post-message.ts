// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { MessageCreatedEvent } from '@/lib/inngest/events'
import { inngest } from '@/lib/inngest/client'
import { parseCheckboxes } from '@/lib/chat/checkboxes'
import { canonicalizeMentions } from '@/lib/chat/mentions'
import { canAccessFile } from '@/lib/permissions'
import { workspaceMemberDisplayName } from '@/lib/workspace-member-display-name'
import type { MessageDto } from './dto'

type PostMessageInput = {
  attachmentFileIds?: string[] | undefined
  content: string
  messageType?: MessageDto['messageType'] | undefined
  parentMessageId?: string | null | undefined
}

type PostMessageArgs = {
  channelId: string
  payload: PostMessageInput
  userId: string
  workspaceId: string
}

export async function postMessage({ channelId, payload, userId, workspaceId }: PostMessageArgs) {
  try {
    const { db } = await import('@cairn/db')
    const { messages, profiles, messageAttachments, files, channels, tasks, workspaceMembers } =
      await import('@cairn/db')
    const { eq, and, isNull, inArray } = await import('drizzle-orm')

    // 引用返信の親は、同一チャンネルの未削除メッセージに限定する。
    // 他チャンネルの ID を親に偽装して内容を引用バーに漏らす攻撃を防ぐ
    if (payload.parentMessageId) {
      const [parent] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.id, payload.parentMessageId),
            eq(messages.channelId, channelId),
            isNull(messages.deletedAt),
          ),
        )
        .limit(1)
      if (!parent) {
        return NextResponse.json({ error: '返信先のメッセージが見つかりません' }, { status: 422 })
      }
    }

    const attachmentFileIds = payload.attachmentFileIds ?? []
    // メンションは名前なしの canonical 形式で保存する（埋め込み名が来ても除去）
    const content = canonicalizeMentions(payload.content)

    if (attachmentFileIds.length > 0) {
      const fileRows = await db
        .select({
          id: files.id,
          workspaceId: files.workspaceId,
          projectId: files.projectId,
          uploadedBy: files.uploadedBy,
        })
        .from(files)
        .where(inArray(files.id, attachmentFileIds))

      if (fileRows.length !== new Set(attachmentFileIds).size) {
        return NextResponse.json({ error: '添付ファイルが見つかりません' }, { status: 404 })
      }

      const accessResults = await Promise.all(
        fileRows.map((file) => canAccessFile(workspaceId, userId, file)),
      )
      if (accessResults.some((canAccess) => !canAccess)) {
        return NextResponse.json(
          { error: '添付ファイルにアクセスする権限がありません' },
          { status: 403 },
        )
      }
    }

    // プロジェクトチャンネルの場合、- [ ] チェックボックスをタスクに自動変換するため先にプロジェクトを解決しておく
    const checkboxes = parseCheckboxes(content)
    const [channel] =
      checkboxes.length > 0
        ? await db
            .select({ projectId: channels.projectId })
            .from(channels)
            .where(eq(channels.id, channelId))
            .limit(1)
        : [undefined]

    const inserted = await db.transaction(async (tx) => {
      const [message] = await tx
        .insert(messages)
        .values({
          channelId,
          senderId: userId,
          content,
          messageType: payload.messageType ?? 'text',
          parentMessageId: payload.parentMessageId ?? null,
        })
        .returning({
          id: messages.id,
          content: messages.content,
          senderId: messages.senderId,
          createdAt: messages.createdAt,
        })

      if (!message) throw new Error('Insert returned no rows')

      if (attachmentFileIds.length > 0) {
        await tx.insert(messageAttachments).values(
          attachmentFileIds.map((fileId, index) => ({
            messageId: message.id,
            fileId,
            displayOrder: index,
          })),
        )
      }

      // メッセージ本文のチェックボックスとタスクの作成を同一トランザクションにし、
      // タスク作成が失敗した場合にメッセージだけが残る不整合を防ぐ
      if (channel?.projectId) {
        const projectId = channel.projectId
        await tx.insert(tasks).values(
          checkboxes.map((checkbox) => ({
            projectId,
            title: checkbox.text,
            status: (checkbox.checked ? 'done' : 'todo') as 'done' | 'todo',
            priority: 'medium' as const,
            createdBy: userId,
            sourceMessageId: message.id,
            sourceCheckboxIndex: checkbox.index,
          })),
        )
      }

      return message
    })

    const [profile] = await db
      .select({
        displayName: workspaceMemberDisplayName(workspaceMembers.displayName, profiles.displayName),
        avatarUrl: workspaceMembers.avatarUrl,
      })
      .from(profiles)
      .leftJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.userId, profiles.id),
          eq(workspaceMembers.workspaceId, workspaceId),
        ),
      )
      .where(eq(profiles.id, inserted.senderId))

    const senderName = profile?.displayName ?? '不明'

    inngest
      .send({
        name: 'message/created',
        data: {
          messageId: inserted.id,
          channelId,
          workspaceId,
          senderId: userId,
          senderName,
          content: inserted.content,
          attachmentFileIds: payload.attachmentFileIds ?? [],
        },
      } satisfies MessageCreatedEvent)
      .catch((err: unknown) => {
        console.warn('[inngest] message/created send failed (Inngest not running?):', err)
      })

    return NextResponse.json(
      {
        id: inserted.id,
        content: inserted.content,
        messageType: payload.messageType ?? 'text',
        senderId: inserted.senderId,
        senderName,
        senderAvatarUrl: profile?.avatarUrl ?? null,
        createdAt: inserted.createdAt.toISOString(),
        isEdited: false,
        reactions: [],
        attachments: [],
        parentMessageId: payload.parentMessageId ?? null,
        replyTo: null,
        bookmarked: false,
      } satisfies MessageDto,
      { status: 201 },
    )
  } catch (err) {
    console.error('[/api/channels/[channelId]/messages POST] DB query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
