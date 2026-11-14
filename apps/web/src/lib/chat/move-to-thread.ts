// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { defaultThreadNameFromMessage } from '@cairn/shared'
import type { MessageType, MoveToThreadBody } from '@cairn/shared'

export type MoveToThreadScope = 'single' | 'after' | 'selected'

/** 切り出し対象として扱うメッセージの最小情報 */
export interface MoveSourceMessage {
  id: string
  content: string
  createdAt: string
}

/**
 * 「スレッドに切り出す」を出すか。親ワークスペースチャンネルの通常メッセージだけが対象で、
 * ゲストには出さない（API も member 以上に限っている）。削除済みメッセージは一覧に出ないためここでは見ない。
 */
export function canMoveMessageToThread(input: {
  isParentWorkspaceChannel: boolean
  role: string | null | undefined
  messageType: MessageType
}): boolean {
  if (!input.isParentWorkspaceChannel) return false
  if (input.messageType === 'system') return false
  return input.role === 'owner' || input.role === 'admin' || input.role === 'member'
}

/** 切り出される先頭メッセージ（範囲の中で最も古いもの）。 */
export function firstMovedMessage(
  scope: MoveToThreadScope,
  anchor: MoveSourceMessage,
  selected: ReadonlyArray<MoveSourceMessage>,
): MoveSourceMessage {
  if (scope !== 'selected' || selected.length === 0) return anchor
  return [...selected].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0]!
}

/** 新規スレッド名の既定値。先頭メッセージの本文から作り、本文が無ければ空にして入力させる。 */
export function defaultMoveThreadName(
  scope: MoveToThreadScope,
  anchor: MoveSourceMessage,
  selected: ReadonlyArray<MoveSourceMessage>,
): string {
  return defaultThreadNameFromMessage(firstMovedMessage(scope, anchor, selected).content)
}

export function buildMoveToThreadBody(input: {
  scope: MoveToThreadScope
  anchorId: string
  selectedIds: ReadonlyArray<string>
  destination: { kind: 'new'; name: string } | { kind: 'existing'; threadId: string }
}): MoveToThreadBody {
  const range: Pick<MoveToThreadBody, 'messageIds' | 'fromMessageId'> = input.scope === 'after'
    ? { fromMessageId: input.anchorId }
    : { messageIds: input.scope === 'selected' ? [...input.selectedIds] : [input.anchorId] }
  return input.destination.kind === 'new'
    ? { ...range, threadName: input.destination.name.trim() }
    : { ...range, threadId: input.destination.threadId }
}
