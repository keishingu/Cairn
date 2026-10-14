// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { canonicalizeMentions, stripMentionsToText } from '@/lib/chat/mentions'
import { formatTaskTitleForDisplay } from '@/lib/task-title-display'
import { TASK_TITLE_MAX_LENGTH } from './title-from-message'

export const TASK_CANDIDATES_MAX = 50

export interface TaskCandidate {
  /**
   * 作成済み判定のキー（tasks.source_line）。メンションは canonical トークン `<@id>` のまま、
   * 行頭記号・Markdown 装飾を除いて trim した行。表示名に依存しないので、名前の変更や同名の別人で
   * キーが変わらない。抽出規則を変えると既存タスクとの対応が外れて再提示される。
   */
  line: string
  /** 表示用。メンションを現在の `@表示名` に解決した行。タスク名の初期値（作成時・作成後に変えられる） */
  title: string
  /** 元の行がリスト・チェックボックス・番号付きリストだったか */
  isListItem: boolean
}

// 引用・見出し・リスト（チェックボックス・番号付き含む）の行頭記号。リスト系は第1グループに入る。
const PREFIX_RE = /^(?:(>\s*)|(#{1,6}(?:\s+|$))|([-*+]\s+\[[ xX]\](?:\s+|$)|[-*+](?:\s+|$)|\d+[.)]\s+))/
const FENCE_RE = /^\s*(```|~~~)/

function parseLine(line: string): { text: string; isListItem: boolean } {
  let current = line.trim()
  let isListItem = false
  for (;;) {
    const match = PREFIX_RE.exec(current)
    if (!match) return { text: current, isListItem }
    if (match[3] !== undefined) isListItem = true
    const next = current.slice(match[0].length).trim()
    if (next === current) return { text: current, isListItem }
    current = next
  }
}

function normalize(text: string): string {
  return Array.from(formatTaskTitleForDisplay(text)).slice(0, TASK_TITLE_MAX_LENGTH).join('').trim()
}

/**
 * メッセージ本文からタスク候補（1行1候補）を作る。コードフェンス内は除外し、行頭記号と Markdown 装飾を除いた
 * 空でない行を、同一キー（line）は最初の1つだけ、200 文字・最大 50 件に収めて返す。
 * line はメンションを `<@id>`（旧形式 `<@id|名前>` も正規化）のまま、title は `@表示名` に解決して作る。
 * line は名前解決（nameOf）に依存しないので、nameOf なしでもキーの集合は同じになる。
 */
export function taskCandidatesFromMessage(
  content: string,
  nameOf?: (id: string) => string | undefined,
): TaskCandidate[] {
  const candidates: TaskCandidate[] = []
  const seen = new Set<string>()
  let inFence = false
  for (const rawLine of canonicalizeMentions(content).split(/\r?\n/)) {
    if (FENCE_RE.test(rawLine)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const parsed = parseLine(rawLine)
    const line = normalize(parsed.text)
    if (!line || seen.has(line)) continue
    seen.add(line)
    candidates.push({ line, title: normalize(stripMentionsToText(parsed.text, nameOf)), isListItem: parsed.isListItem })
    if (candidates.length >= TASK_CANDIDATES_MAX) break
  }
  return candidates
}
