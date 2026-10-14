// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'
import { WORKSPACE_CHANNEL_NAME_MAX } from './workspace-channel-copy'

/** 1回で切り出せるメッセージ数の上限。トランザクション内で親チャンネルをロックし続ける時間を抑える。 */
export const MOVE_TO_THREAD_MAX_MESSAGES = 500

/** スレッド名の既定値に使う、先頭メッセージ本文の最大文字数（コードポイント単位）。 */
export const MOVE_TO_THREAD_DEFAULT_NAME_LENGTH = 30

/**
 * 切り出す先頭メッセージの本文から、新規スレッド名の既定値を作る。
 * 改行・連続空白は1つの半角スペースに畳み、サロゲートペア（絵文字など）を割らずに先頭30文字で切る。
 * 本文が空（添付だけなど）なら空文字を返し、利用者に入力させる。
 */
export function defaultThreadNameFromMessage(content: string): string {
  const collapsed = content.replace(/\s+/g, ' ').trim()
  return Array.from(collapsed).slice(0, MOVE_TO_THREAD_DEFAULT_NAME_LENGTH).join('').trim()
}

export const moveToThreadBodySchema = z
  .object({
    messageIds: z.array(z.string().uuid()).min(1).optional(),
    fromMessageId: z.string().uuid().optional(),
    threadId: z.string().uuid().optional(),
    threadName: z.string().trim().min(1).max(WORKSPACE_CHANNEL_NAME_MAX).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.messageIds === undefined) === (value.fromMessageId === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['messageIds'], message: 'scope' })
    }
    if ((value.threadId === undefined) === (value.threadName === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['threadId'], message: 'destination' })
    }
  })

export type MoveToThreadBody = z.infer<typeof moveToThreadBodySchema>

export interface MoveToThreadResult {
  threadId: string
  movedCount: number
}
