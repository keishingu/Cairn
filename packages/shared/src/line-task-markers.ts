// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * タスク化した行の行末に「✓ タスク」ラベルを出すための、描画用の目印（プレースホルダ）。
 * 本文を Markdown として描画する直前に、派生した文字列へだけ差し込む。保存・編集・コピーする本文には混ぜない。
 * 目印は私用領域の文字で挟んだ配列添字（`<index>`）。Markdown 側で特別扱いされず、
 * 描画側が text ノードの中で見つけてラベルに置き換える。
 */
export const LINE_TASK_MARKER_OPEN = ''
export const LINE_TASK_MARKER_CLOSE = ''

const MARKER_CHARS_RE = /[]/g
const MARKER_SPLIT_RE = /(\d+)/g

// 目印を付けると Markdown の意味が変わる行（表の行・水平線・setext 見出しの下線・リンク参照定義・HTML ブロック）
// タスク候補の抽出（task-candidates.ts）と同じ。コードフェンス内の行は候補にならない
const FENCE_RE = /^\s*(```|~~~)/
const TABLE_ROW_RE = /\|\s*$/
const RULE_RE = /^\s*(?:(?:[-*_]\s*){3,}|=+\s*)$/
// 4 スペース以上（またはタブ）の字下げで、リスト記号も付かない行はインデントコードになりうる
// `[ref]: https://…` は非表示の定義行。末尾に足すと定義でなくなり、参照リンクが切れて本文に出てしまう
const LINK_REFERENCE_DEFINITION_RE = /^ {0,3}\[[^\]]+\]:/
// `<div>…` などで始まる HTML ブロックは目印ごと HTML ノードになり、Web は描画せずアプリは目印を消すため、ラベルが出ない
const HTML_BLOCK_RE = /^ {0,3}(?:<\/?[A-Za-z][A-Za-z0-9-]*(?:\s|\/?>|$)|<!--)/
const INDENTED_CODE_RE = /^(?: {4,}|\t)(?![-*+]\s|\d+[.)]\s)/

export interface LineTaskPlacement {
  /** 目印を差し込んだ描画用の本文。元の本文は変更しない */
  text: string
  /** tasks と同じ並びで、その行に目印を差し込めたか */
  placed: boolean[]
}

/** 本文に紛れ込んだ目印用の文字を取り除く（利用者が目印を偽装して書けないように） */
export function stripLineTaskMarkers(value: string): string {
  return value.replace(MARKER_CHARS_RE, '')
}

/**
 * `lineIndex`（本文を `\n` で分割した 0 始まりの行番号）の行末に目印を差し込む。
 * 同じ行に複数あれば順に並べる。行が無い・空・Markdown の意味が変わる行には差し込まず、placed を false にする
 * （呼び出し側はその分を従来どおり下部のチップで示す）。
 */
export function insertLineTaskMarkers(
  content: string,
  tasks: readonly { lineIndex: number | null }[],
): LineTaskPlacement {
  const placed = tasks.map(() => false)
  const clean = stripLineTaskMarkers(content)
  if (tasks.every(task => task.lineIndex === null)) return { text: clean, placed }

  const lines = clean.split('\n')
  // コードフェンスと HTML ブロックの行・内側は、サーバーが対応付けていても目印を付けない。
  // HTML ブロックは空行まで（コメントは `-->` まで）が1つの HTML ノードになる
  const fenced = new Set<number>()
  let inFence = false
  let html: 'tag' | 'comment' | null = null
  lines.forEach((line, index) => {
    if (!html && FENCE_RE.test(line)) {
      inFence = !inFence
      fenced.add(index)
    } else if (inFence) {
      fenced.add(index)
    } else if (html) {
      if (html === 'tag' && line.trim() === '') {
        html = null
        return
      }
      fenced.add(index)
      if (html === 'comment' && line.includes('-->')) html = null
    } else if (HTML_BLOCK_RE.test(line)) {
      fenced.add(index)
      const comment = /^ {0,3}<!--/.test(line)
      html = comment ? (line.includes('-->', line.indexOf('<!--') + 4) ? null : 'comment') : 'tag'
    }
  })
  const markersByLine = new Map<number, string>()
  tasks.forEach((task, index) => {
    const lineIndex = task.lineIndex
    if (lineIndex === null || lineIndex < 0 || lineIndex >= lines.length) return
    const line = lines[lineIndex]!
    if (fenced.has(lineIndex) || line.trim() === '' || TABLE_ROW_RE.test(line) || RULE_RE.test(line) || INDENTED_CODE_RE.test(line) || LINK_REFERENCE_DEFINITION_RE.test(line)) return
    markersByLine.set(
      lineIndex,
      `${markersByLine.get(lineIndex) ?? ''}${LINE_TASK_MARKER_OPEN}${index}${LINE_TASK_MARKER_CLOSE}`,
    )
    placed[index] = true
  })
  if (markersByLine.size === 0) return { text: clean, placed }

  for (const [lineIndex, markers] of markersByLine) {
    // 直前の空白は URL の自動リンクが目印まで飲み込まないようにするためのもの
    lines[lineIndex] = `${lines[lineIndex]!.trimEnd()} ${markers}`
  }
  return { text: lines.join('\n'), placed }
}

/** 目印（直前の区切りの空白を含む）を丸ごと取り除く。コードなど、ラベルを出さない場所に紛れた分の後始末 */
export function removeLineTaskMarkers(value: string): string {
  return value.replace(/ ?\uE000\d+\uE001/g, '')
}

export type LineTaskMarkerPart = string | { taskIndex: number }

/** 文字列を、通常の文字列と目印（tasks の添字）に分ける。目印が無ければ元の文字列1つを返す */
export function splitLineTaskMarkers(value: string): LineTaskMarkerPart[] {
  const parts: LineTaskMarkerPart[] = []
  let last = 0
  for (const match of value.matchAll(MARKER_SPLIT_RE)) {
    if (match.index > last) parts.push(value.slice(last, match.index))
    parts.push({ taskIndex: Number(match[1]) })
    last = match.index + match[0].length
  }
  if (last === 0) return [value]
  if (last < value.length) parts.push(value.slice(last))
  return parts
}
