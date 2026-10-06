// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { ReactionDto } from '@/app/api/channels/[channelId]/messages/route'

const VISIBLE_NAME_COUNT = 2

/**
 * メッセージ単位の「誰がリアクションしたか」の要約。先頭の数人の名前と、残りの人数を返す。
 * DTO は表示名しか持たないため、複数の絵文字を付けた人は表示名で1人にまとめる（同名の別人も1人に数える）。
 */
export function summarizeReactionPeople(
  reactions: ReadonlyArray<Pick<ReactionDto, 'userNames'>>,
): { names: string[]; restCount: number } | null {
  const uniqueNames = [...new Set(reactions.flatMap(reaction => reaction.userNames.filter(Boolean)))]
  if (uniqueNames.length === 0) return null
  return {
    names: uniqueNames.slice(0, VISIBLE_NAME_COUNT),
    restCount: Math.max(0, uniqueNames.length - VISIBLE_NAME_COUNT),
  }
}
