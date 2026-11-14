// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { Nodes, Root } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'

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
 * 同じ行に複数あれば順に並べる。行が無い・空・描画される文章の外（コード・表・HTML 等）や Markdown の構造が変わる行には差し込まず、placed を false にする
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
  // 行ごとの目印を集める。範囲外・空行には付けない
  const candidates = new Map<number, number[]>()
  tasks.forEach((task, index) => {
    const lineIndex = task.lineIndex
    if (lineIndex === null || lineIndex < 0 || lineIndex >= lines.length) return
    if (lines[lineIndex]!.trim() === '') return
    candidates.set(lineIndex, [...(candidates.get(lineIndex) ?? []), index])
  })
  if (candidates.size === 0) return { text: clean, placed }

  // 元の本文の構造。目印を付けても変わってはならない
  const baseShape = shapeOf(parse(clean))
  const sorted = [...candidates].sort((a, b) => a[0] - b[0])
  const check = (trial: ReadonlyMap<number, readonly number[]>) => {
    const tree = parse(render(lines, trial))
    const visible = visibleMarkerIndexes(tree)
    const hiddenLines = [...trial].filter(([, indexes]) => !indexes.every(index => visible.has(index))).map(([lineIndex]) => lineIndex)
    return { sameShape: shapeOf(tree) === baseShape, hiddenLines }
  }
  // 解析回数を抑えるため、まず全行を一括で確かめ、目印が描画されない行を外して確かめ直す（通常は1〜2回で済む）
  let accepted = new Map<number, number[]>(sorted)
  let result = check(accepted)
  if (result.sameShape && result.hiddenLines.length > 0) {
    for (const lineIndex of result.hiddenLines) accepted.delete(lineIndex)
    result = accepted.size > 0 ? check(accepted) : { sameShape: true, hiddenLines: [] }
  }
  if (!result.sameShape || result.hiddenLines.length > 0) {
    // 表・定義などの構造が変わる行があるときだけ、行を1つずつ足して構造が変わらず描画される行だけ採用する
    const candidatesLeft = [...accepted]
    accepted = new Map()
    for (const [lineIndex, indexes] of candidatesLeft) {
      const trial = new Map(accepted).set(lineIndex, indexes)
      const trialResult = check(trial)
      if (trialResult.sameShape && trialResult.hiddenLines.length === 0) accepted = trial
    }
  }
  for (const indexes of accepted.values()) for (const index of indexes) placed[index] = true
  if (accepted.size === 0) return { text: clean, placed }
  return { text: render(lines, accepted), placed }
}

function render(lines: readonly string[], markersByLine: ReadonlyMap<number, readonly number[]>): string {
  return lines
    .map((line, lineIndex) => {
      const indexes = markersByLine.get(lineIndex)
      if (!indexes) return line
      const markers = indexes.map(index => `${LINE_TASK_MARKER_OPEN}${index}${LINE_TASK_MARKER_CLOSE}`).join('')
      // 直前の空白は URL の自動リンクが目印まで飲み込まないようにするためのもの
      return `${line.trimEnd()} ${markers}`
    })
    .join('\n')
}

function parse(text: string): Root {
  return fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
}

// 子のブロックを持つ入れ物。これ以外（段落・見出し・コード・HTML・定義など）は種別だけを見る
const BLOCK_CONTAINERS = new Set(['root', 'blockquote', 'list', 'listItem', 'table', 'tableRow', 'footnoteDefinition'])

/** ブロック構造（種別の入れ子）。目印で表・定義・見出し等が変わっていないかの比較に使う。行内の text 増減は見ない */
function shapeOf(node: Nodes): string {
  if (!BLOCK_CONTAINERS.has(node.type) || !('children' in node)) return node.type
  return `${node.type}(${node.children.map(shapeOf).join(',')})`
}

// 目印が表示されない（または意味を持たない）祖先。リンク内はラベルがリンクの一部になるため外す
const HIDDEN_ANCESTORS = new Set(['html', 'code', 'inlineCode', 'table', 'definition', 'link', 'linkReference'])

/** 実際に見える文章（paragraph / heading の text）の中にある目印の添字 */
function visibleMarkerIndexes(root: Root): Set<number> {
  const found = new Set<number>()
  const walk = (node: Nodes, inText: boolean, hidden: boolean) => {
    if (node.type === 'text') {
      if (inText && !hidden) for (const match of node.value.matchAll(MARKER_SPLIT_RE)) found.add(Number(match[1]))
      return
    }
    if (!('children' in node)) return
    const nextHidden = hidden || HIDDEN_ANCESTORS.has(node.type)
    const nextInText = inText || node.type === 'paragraph' || node.type === 'heading'
    for (const child of node.children) walk(child, nextInText, nextHidden)
  }
  walk(root, false, false)
  return found
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
