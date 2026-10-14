// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto'
import { canonicalizeMentions, stripMentionsToText } from '@/lib/chat/mentions'
import { formatTaskTitleForDisplay } from '@/lib/task-title-display'
import { TASK_TITLE_MAX_LENGTH } from './title-from-message'

export const TASK_CANDIDATES_MAX = 50

export interface TaskCandidate {
  /**
   * 作成済み判定のキー（tasks.source_line）。メンションを canonical トークン `<@id>` にし、行頭記号を除いて
   * trim した「生の行」の SHA-256 hex。Markdown 装飾の除去や 200 文字の切り詰めはかけないので、
   * リンク先だけ違う行や先頭が同じ長い行も別のキーになる。表示名に依存しないので、名前の変更や同名の別人で
   * キーが変わらない。btree の行サイズ上限を避けるため、生の行ではなくハッシュを保存する。
   * 抽出規則を変えると既存タスクとの対応が外れて再提示される。
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

function lineKey(rawText: string): string {
  return createHash('sha256').update(rawText).digest('hex')
}

function normalize(text: string): string {
  return Array.from(formatTaskTitleForDisplay(text)).slice(0, TASK_TITLE_MAX_LENGTH).join('').trim()
}

/**
 * メッセージ本文からタスク候補（1行1候補）を作る。コードフェンス内は除外し、行頭記号を除いた空でない行を
 * 候補にする。同一の行（line が同じ）は最初の1つだけ、最大 50 件に収めて返す。
 * line は生の行（メンションは `<@id>`、旧形式 `<@id|名前>` も正規化）のハッシュ、title は Markdown 装飾を除き
 * 200 文字に切り詰めて `@表示名` に解決した表示用の文字列。
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
    // 表示用の title が空になる行（装飾だけ等）は候補にしない
    const title = normalize(stripMentionsToText(parsed.text, nameOf))
    if (!parsed.text || !title) continue
    const line = lineKey(parsed.text)
    if (seen.has(line)) continue
    seen.add(line)
    candidates.push({ line, title, isListItem: parsed.isListItem })
    if (candidates.length >= TASK_CANDIDATES_MAX) break
  }
  return candidates
}

// toggleCheckboxAt（チャットのチェックボックス操作）と同じ正規表現。出現順が source_checkbox_index。
const CHECKBOX_RE = /^([-*+] \[)([ x])(\] .*)$/gm

/**
 * `- [ ]` 時代に作られたタスク（source_checkbox_index あり、source_line なし）を、元の位置の候補（line）に対応付ける。
 * 本文中の source_checkbox_index 番目のチェックボックス行の候補キーで引き、引けなければ
 * 表示タイトル（formatTaskTitleForDisplay 済み）が同じ候補にフォールバックする。戻り値は line → タスク ID。
 */
export function legacyCheckboxTaskIdByLine(
  content: string,
  legacyTasks: { id: string; title: string; sourceCheckboxIndex: number }[],
  nameOf?: (id: string) => string | undefined,
): Map<string, string> {
  const result = new Map<string, string>()
  if (legacyTasks.length === 0) return result
  const candidates = taskCandidatesFromMessage(content, nameOf)
  const candidateLines = new Set(candidates.map(c => c.line))
  const checkboxLines = Array.from(canonicalizeMentions(content).matchAll(CHECKBOX_RE), m => {
    const text = parseLine(m[0]).text
    return text ? lineKey(text) : null
  })
  for (const task of legacyTasks) {
    const byIndex = checkboxLines[task.sourceCheckboxIndex]
    let line = byIndex && candidateLines.has(byIndex) ? byIndex : undefined
    if (line === undefined) {
      const title = normalize(task.title)
      line = candidates.find(c => c.title === title && !result.has(c.line))?.line
    }
    if (line !== undefined && !result.has(line)) result.set(line, task.id)
  }
  return result
}
