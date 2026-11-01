// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export type AiFocusStep =
  | { kind: 'wait' }
  | { kind: 'create' }
  | { kind: 'open'; conversationId: string }
  | { kind: 'focus'; conversationId: string }

/**
 * 入力欄へのフォーカス要求（?focus=1）で次にすること。押すたびに空の会話を増やさないよう、直近の会話が空なら使い回す。
 * タイトルは最初の応答を保存した後に別の更新で付くため、タイトルなしだけでは空と決めず、開いて中身を確かめる。
 */
export function nextAiFocusStep(input: {
  // 新しい順。取得中は undefined
  conversations: ReadonlyArray<{ id: string; title: string | null }> | undefined
  activeId: string | null
  // activeId の会話の中身。取得中は undefined
  activeMessages: readonly unknown[] | undefined
}): AiFocusStep {
  if (!input.conversations) return { kind: 'wait' }
  const latest = input.conversations[0]
  if (!latest || latest.title !== null) return { kind: 'create' }
  if (input.activeId !== latest.id) return { kind: 'open', conversationId: latest.id }
  if (!input.activeMessages) return { kind: 'wait' }
  return input.activeMessages.length === 0 ? { kind: 'focus', conversationId: latest.id } : { kind: 'create' }
}
