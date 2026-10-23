// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export const WORKSPACE_CHANNEL_NAME_MAX = 60

export function workspaceChannelDisplayName(name: string | null | undefined, isThread: boolean): string {
  const trimmed = name?.trim() ?? ''
  if (trimmed) return trimmed
  return isThread ? '名称未設定スレッド' : '名称未設定チャンネル'
}

export function workspaceChannelDeleteCopy(input: {
  name: string | null | undefined
  isThread: boolean
  childThreadCount: number
}): { title: string; message: string } {
  const label = workspaceChannelDisplayName(input.name, input.isThread)
  if (input.isThread) {
    return {
      title: 'スレッドを削除',
      message: `スレッド「${label}」を削除します。メッセージとタスクも一緒に削除され、元に戻せません。`,
    }
  }
  const removed = input.childThreadCount > 0
    ? 'メッセージ、タスク、配下のスレッドも一緒に削除され、元に戻せません。'
    : 'メッセージとタスクも一緒に削除され、元に戻せません。'
  return {
    title: 'チャンネルを削除',
    message: `「${label}」を削除します。${removed}`,
  }
}
