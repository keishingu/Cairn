// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { extractMentionIds, hasGroupMention } from '@/lib/chat/mentions'

/**
 * 投稿が `message/created`（on-message-created）を必要とするか。
 *
 * on-message-created が通知を作るのは DM・メンション・返信・添付のどれかに当たる投稿だけで、
 * それ以外の投稿でも起動すると何も作らないまま数 step 分の実行数を使う（Inngest は step ごとに数える）。
 * チャンネルの種別が分からないときは判断できないため、送る側に倒す。
 */
export function needsMessageCreatedJob(input: {
  channelType: string | null | undefined
  content: string
  attachmentFileIds: readonly string[]
  parentMessageId: string | null | undefined
}): boolean {
  if (!input.channelType || input.channelType === 'dm') return true
  if (input.attachmentFileIds.length > 0) return true
  if (input.parentMessageId) return true
  return extractMentionIds(input.content).length > 0 || hasGroupMention(input.content)
}
