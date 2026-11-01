// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// /ai（AIチャット）を使えるワークスペースロールの範囲。owner が決める（workspaces.ai_chat_access）。
// 経験の浅いメンバーが AI に頼りすぎないよう、使える人を絞れるようにする。
// 値の集合は CHECK 制約と同じなので、追加・変更時は migration も更新する。
//   owner:  owner だけ
//   admin:  owner と admin
//   member: 全員（member とゲスト。ゲストは従来どおり参加プロジェクトの範囲だけを読む）
export const AI_CHAT_ACCESS_LEVELS = ['owner', 'admin', 'member'] as const
export type AiChatAccessLevel = (typeof AI_CHAT_ACCESS_LEVELS)[number]

// 既定は従来どおり全員が使える
export const DEFAULT_AI_CHAT_ACCESS: AiChatAccessLevel = 'member'

export function isAiChatAccessLevel(value: unknown): value is AiChatAccessLevel {
  return AI_CHAT_ACCESS_LEVELS.includes(value as AiChatAccessLevel)
}

export function canUseAiChat(role: 'owner' | 'admin' | 'member' | 'guest', level: AiChatAccessLevel): boolean {
  if (level === 'owner') return role === 'owner'
  if (level === 'admin') return role === 'owner' || role === 'admin'
  return true
}
