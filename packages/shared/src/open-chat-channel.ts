// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * 確定した一覧と比べて、開いている会話がもう無いときに true。
 * previouslyVisibleIds が null のときは、その一覧が最初の確定結果。
 * 一度も載っていない ID（作成直後で再取得前）は、直前の一覧があるときだけ残す。
 */
export function openChannelDisappeared(
  openChannelId: string | null,
  previouslyVisibleIds: readonly string[] | null,
  visibleIds: readonly string[],
): boolean {
  if (!openChannelId || visibleIds.includes(openChannelId)) return false
  if (!previouslyVisibleIds) return true
  return previouslyVisibleIds.includes(openChannelId)
}

/** 削除後に残す会話。未アーカイブのプロジェクト、ワークスペースチャンネル、DM の順。 */
export function nextChatChannelAfterRemoval(input: {
  projectChannels: readonly { id: string; archived: boolean }[]
  workspaceChannelIds: readonly string[]
  dmIds: readonly string[]
}): string | null {
  return input.projectChannels.find(channel => !channel.archived)?.id
    ?? input.workspaceChannelIds[0]
    ?? input.dmIds[0]
    ?? null
}
