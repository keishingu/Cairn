// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { stripMentionsToText } from '@/lib/chat/mentions'
import { formatTaskTitleForDisplay } from '@/lib/task-title-display'
import { TASK_TITLE_MAX_LENGTH } from './title-from-message'

export const TASK_CANDIDATES_MAX = 50

export interface TaskCandidate {
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

/**
 * メッセージ本文からタスク候補（1行1候補）を作る。メンションは `@表示名`、コードフェンス内は除外し、
 * 行頭記号と Markdown 装飾を除いた空でない行を、同一タイトルは最初の1つだけ、
 * 200 文字・最大 50 件に収めて返す。
 */
export function taskCandidatesFromMessage(
  content: string,
  nameOf?: (id: string) => string | undefined,
): TaskCandidate[] {
  const text = stripMentionsToText(content, nameOf)
  const candidates: TaskCandidate[] = []
  const seen = new Set<string>()
  let inFence = false
  for (const line of text.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const parsed = parseLine(line)
    const title = Array.from(formatTaskTitleForDisplay(parsed.text)).slice(0, TASK_TITLE_MAX_LENGTH).join('').trim()
    if (!title || seen.has(title)) continue
    seen.add(title)
    candidates.push({ title, isListItem: parsed.isListItem })
    if (candidates.length >= TASK_CANDIDATES_MAX) break
  }
  return candidates
}
