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
  /** 本文（canonical）を `\n` で分割したときの元の行番号（0始まり）。タスク化した行の行末ラベルの位置に使う */
  rawLineIndex: number
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
  // 行番号は DB の本文を `\n` で分けたときの番号（\r は行末に残るだけで行数に影響しない）
  const rawLines = canonicalizeMentions(content).split('\n')
  for (const [rawLineIndex, rawLine] of rawLines.entries()) {
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
    candidates.push({ line, title, isListItem: parsed.isListItem, rawLineIndex })
    if (candidates.length >= TASK_CANDIDATES_MAX) break
  }
  return candidates
}

// toggleCheckboxAt（チャットのチェックボックス操作）と同じ正規表現。出現順が source_checkbox_index。
const CHECKBOX_RE = /^([-*+] \[)([ x])(\] .*)$/gm

/**
 * `- [ ]` 時代に作られたタスク（source_checkbox_index あり、source_line なし）を、元の位置の候補（line）に対応付ける。
 * 位置（source_checkbox_index 番目のチェックボックス行）とタイトルが一致する行、タイトルが一致する行、
 * 空いている位置の行の順に対応付ける。戻り値は line → タスク ID。
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
  const titleByLine = new Map(candidates.map(c => [c.line, c.title]))
  const indexLineOf = (task: { sourceCheckboxIndex: number }) => {
    const line = checkboxLines[task.sourceCheckboxIndex]
    return line && candidateLines.has(line) ? line : undefined
  }
  // 移行後の本文編集では source_checkbox_index が更新されず位置がずれうるため、
  // まず「位置とタイトルが一致」→「タイトル一致」で対応付け、残ったタスクだけ空いている位置の行に対応付ける
  // （タスク側で改名された旧タスクも位置で拾える）。
  const unmatched: typeof legacyTasks = []
  for (const task of legacyTasks) {
    const title = normalize(task.title)
    const byIndex = indexLineOf(task)
    let line = byIndex && titleByLine.get(byIndex) === title && !result.has(byIndex) ? byIndex : undefined
    if (line === undefined) {
      line = candidates.find(c => c.title === title && !result.has(c.line))?.line
    }
    if (line !== undefined) result.set(line, task.id)
    else unmatched.push(task)
  }
  for (const task of unmatched) {
    const byIndex = indexLineOf(task)
    if (byIndex !== undefined && !result.has(byIndex)) result.set(byIndex, task.id)
  }
  return result
}

/**
 * メッセージを出典とするタスクごとに、本文（canonical）の元の行番号（0始まり）を返す。行末の「✓ タスク」ラベルの位置に使う。
 * source_line が一致する候補の行、旧チェックボックス由来のタスクは legacyCheckboxTaskIdByLine で対応付けた行を使う。
 * 対応する行が無い（本文編集で消えた等）タスクは null。名前解決は不要（line は名前に依存しない）。
 */
export function linkedTaskLineIndexes(
  content: string,
  tasks: { id: string; title: string; sourceLine: string | null; sourceCheckboxIndex: number | null }[],
): Map<string, number | null> {
  const result = new Map<string, number | null>(tasks.map(task => [task.id, null]))
  if (tasks.length === 0) return result
  const candidates = taskCandidatesFromMessage(content)
  const indexByLine = new Map(candidates.map(c => [c.line, c.rawLineIndex]))
  const legacyTasks: { id: string; title: string; sourceCheckboxIndex: number }[] = []
  for (const task of tasks) {
    if (task.sourceLine !== null) {
      result.set(task.id, indexByLine.get(task.sourceLine) ?? null)
    } else if (task.sourceCheckboxIndex !== null) {
      legacyTasks.push({ id: task.id, title: task.title, sourceCheckboxIndex: task.sourceCheckboxIndex })
    }
  }
  for (const [line, taskId] of legacyCheckboxTaskIdByLine(content, legacyTasks)) {
    result.set(taskId, indexByLine.get(line) ?? null)
  }
  return result
}
