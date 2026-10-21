// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// Slack の mrkdwn をトークン列にする。Cairn の Markdown（mdast）とは記法が違う別物として扱う。
// Web とネイティブはこの結果を描くだけにし、記法の解釈を各プラットフォームで二重に持たない（docs/app-platform-design.md §4.3）。
//
// 対応する記法: *太字* _斜体_ ~取り消し~ `code` ```複数行コード``` 行頭の > 引用 改行
//               <url> <url|表示> <@userId> <!here> <!channel> <!everyone>、本文の https URL
// 文字参照は Slack と同じく &amp; &lt; &gt; の3つだけを戻す。

export type MrkdwnInline =
  | { type: 'text'; text: string }
  | { type: 'bold' | 'italic' | 'strike'; children: MrkdwnInline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; url: string; text: string }
  | { type: 'mention'; userId: string }
  | { type: 'broadcast'; target: 'here' | 'channel' | 'everyone' }
  | { type: 'break' }

export type MrkdwnBlock =
  | { type: 'paragraph'; children: MrkdwnInline[] }
  | { type: 'quote'; children: MrkdwnInline[] }
  | { type: 'pre'; text: string }

const FORMAT_TYPES = { '*': 'bold', _: 'italic', '~': 'strike' } as const
type FormatMarker = keyof typeof FORMAT_TYPES

// 記号の前後が「単語の続き」かどうか。Slack は英数字に隣接する記号を書式にしない（snake_case や 2*3*4 を崩さないため）。
// 日本語は単語間に空白を置かないので、CJK を単語文字に含めると「これは*太字*です」が効かなくなる。ASCII の英数字だけを単語文字にする
const WORD_CHAR = /[A-Za-z0-9]/
const LINK_SCHEMES = /^(?:https?:\/\/|mailto:)/i
const BARE_URL = /https:\/\/[^\s<>]+/
const QUOTE_LINE = /^(?:>|&gt;) ?/

/**
 * verbatim は Slack と同じく、本文中の URL を自動でリンクにしないことを表す（明示した <url> はリンクにする）
 */
export function parseMrkdwn(source: string, options: { verbatim?: boolean } = {}): MrkdwnBlock[] {
  const autolink = !options.verbatim
  const blocks: MrkdwnBlock[] = []
  const segments = source.split('```')
  // ``` が閉じていなければ、最後の ``` は文字としてその前の本文へつなぎ直す
  if (segments.length % 2 === 0) {
    const tail = segments.pop()!
    segments[segments.length - 1] += '```' + tail
  }
  segments.forEach((segment, index) => {
    if (index % 2 === 1) {
      blocks.push({ type: 'pre', text: unescapeEntities(segment.replace(/^\n/, '').replace(/\n$/, '')) })
      return
    }
    blocks.push(...parseLines(segment, autolink))
  })
  return blocks
}

function parseLines(text: string, autolink: boolean): MrkdwnBlock[] {
  const blocks: MrkdwnBlock[] = []
  type Group = { type: 'paragraph' | 'quote'; lines: string[] }
  // クロージャから書き換えるため、let の絞り込みに頼らず入れ物に持つ
  const state: { current: Group | null } = { current: null }
  const flush = () => {
    const current = state.current
    if (!current) return
    const children: MrkdwnInline[] = []
    current.lines.forEach((line, index) => {
      if (index > 0) children.push({ type: 'break' })
      children.push(...parseMrkdwnInline(line, autolink))
    })
    if (children.some((child) => child.type !== 'break')) blocks.push({ type: current.type, children })
    state.current = null
  }
  for (const line of text.split('\n')) {
    const isQuote = QUOTE_LINE.test(line)
    const type = isQuote ? 'quote' : 'paragraph'
    if (state.current?.type !== type) {
      flush()
      state.current = { type, lines: [] }
    }
    state.current.lines.push(isQuote ? line.replace(QUOTE_LINE, '') : line)
  }
  flush()
  return blocks
}

// 書式の入れ子の上限。これより深い記号は文字として残す（再帰で解析時間が伸びないようにする）
const MAX_FORMAT_DEPTH = 4

/**
 * 1行分。改行をまたぐ書式は Slack と同じく作らない。
 * 本文はアプリが送る未信頼の値で、1つの text だけで 3000 文字ある。閉じ記号の探索で行を何度も走査すると
 * 細工した本文で描画が固まるため、`<…>` とコードの範囲・閉じ記号の候補を1回の走査で先に求めておく
 */
export function parseMrkdwnInline(line: string, autolink = true, depth = 0): MrkdwnInline[] {
  const { atomEnd, closers } = analyzeLine(line)
  const nodes: MrkdwnInline[] = []
  let buffer = ''
  const flushText = () => {
    if (buffer) nodes.push(...textNodes(unescapeEntities(buffer), autolink))
    buffer = ''
  }
  let i = 0
  while (i < line.length) {
    const char = line[i]!
    const end = atomEnd[i] ?? -1
    if (end !== -1) {
      flushText()
      nodes.push(char === '<' ? parseTag(line.slice(i + 1, end)) : { type: 'code', text: unescapeEntities(line.slice(i + 1, end)) })
      i = end + 1
      continue
    }
    if (char in FORMAT_TYPES && depth < MAX_FORMAT_DEPTH) {
      const close = findClosingMarker(line, i, char as FormatMarker, closers[char as FormatMarker])
      if (close !== -1) {
        flushText()
        nodes.push({ type: FORMAT_TYPES[char as FormatMarker], children: parseMrkdwnInline(line.slice(i + 1, close), autolink, depth + 1) })
        i = close + 1
        continue
      }
    }
    buffer += char
    i += 1
  }
  flushText()
  return nodes
}

type LineAnalysis = {
  /** `<` や `` ` `` の位置 → 対応する閉じ位置。原子（中で書式を解釈しない範囲）の開始位置だけが値を持つ */
  atomEnd: number[]
  /** 記号ごとの、閉じ記号になれる位置（昇順）。原子の内側は含まない */
  closers: Record<FormatMarker, number[]>
}

/** 1回の走査で、原子の範囲と閉じ記号の候補を求める */
function analyzeLine(line: string): LineAnalysis {
  const atomEnd: number[] = []
  const closers: Record<FormatMarker, number[]> = { '*': [], _: [], '~': [] }
  // indexOf が一度見つからなければ、それ以降にもその文字はない。同じ文字を探して行を何度も走査しない
  let noMoreGt = false
  let noMoreBacktick = false
  let k = 0
  while (k < line.length) {
    const char = line[k]!
    if ((char === '<' && !noMoreGt) || (char === '`' && !noMoreBacktick)) {
      const end = line.indexOf(char === '<' ? '>' : '`', k + 1)
      if (end === -1) {
        if (char === '<') noMoreGt = true
        else noMoreBacktick = true
      } else if (end > k + 1) {
        atomEnd[k] = end
        k = end + 1
        continue
      }
    }
    if (char in FORMAT_TYPES && k > 0) {
      const last = line[k - 1]!
      const after = line[k + 1]
      if (!/\s/.test(last) && !(after !== undefined && (WORD_CHAR.test(after) || after === char))) {
        closers[char as FormatMarker].push(k)
      }
    }
    k += 1
  }
  return { atomEnd, closers }
}

function findClosingMarker(line: string, start: number, marker: FormatMarker, candidates: number[]): number {
  const before = line[start - 1]
  const first = line[start + 1]
  if (before !== undefined && (WORD_CHAR.test(before) || before === marker)) return -1
  if (first === undefined || /\s/.test(first) || first === marker) return -1
  // start + 2 以降で最初の候補を二分探索で引く
  let low = 0
  let high = candidates.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (candidates[mid]! < start + 2) low = mid + 1
    else high = mid
  }
  return candidates[low] ?? -1
}

function parseTag(body: string): MrkdwnInline {
  const separator = body.indexOf('|')
  const target = separator === -1 ? body : body.slice(0, separator)
  const label = separator === -1 ? undefined : body.slice(separator + 1)
  if (target.startsWith('@') && target.length > 1) {
    // Cairn の canonical メンション `<@userId>` と同じ記法。旧形式 `<@id|名前>` の名前は使わず、表示時に最新名へ解決する
    return { type: 'mention', userId: target.slice(1) }
  }
  if (target === '!here' || target === '!channel' || target === '!everyone') {
    return { type: 'broadcast', target: target.slice(1) as 'here' | 'channel' | 'everyone' }
  }
  if (LINK_SCHEMES.test(target)) {
    const url = unescapeEntities(target)
    return { type: 'link', url, text: label ? unescapeEntities(label) : url }
  }
  // チャンネル参照（<#C…>）・日付（<!date^…>）・不明なスキームはリンクにせず、表示名か中身をそのまま文字で出す
  return { type: 'text', text: unescapeEntities(label ?? body) }
}

function textNodes(text: string, autolink: boolean): MrkdwnInline[] {
  if (!autolink) return [{ type: 'text', text }]
  const nodes: MrkdwnInline[] = []
  let last = 0
  // Web の lib は ES2017 で matchAll を使えないため exec で回す
  const pattern = new RegExp(BARE_URL.source, 'g')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const index = match.index
    if (index > last) nodes.push({ type: 'text', text: text.slice(last, index) })
    // 文末の句読点や閉じ括弧は URL に含めない
    const url = match[0].replace(/[.,!?)\]}。、）」』]+$/u, '')
    nodes.push({ type: 'link', url, text: url })
    last = index + url.length
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) })
  return nodes
}

function unescapeEntities(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/** 通知・アクセシビリティ・代替表示用に、書式を落とした文字列へ戻す */
export function mrkdwnToPlainText(blocks: MrkdwnBlock[], resolveMention: (userId: string) => string): string {
  return blocks
    .map((block) => (block.type === 'pre' ? block.text : inlineToPlainText(block.children, resolveMention)))
    .join('\n')
}

function inlineToPlainText(nodes: MrkdwnInline[], resolveMention: (userId: string) => string): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.text
        case 'bold':
        case 'italic':
        case 'strike':
          return inlineToPlainText(node.children, resolveMention)
        case 'link':
          return node.text
        case 'mention':
          return `@${resolveMention(node.userId)}`
        case 'broadcast':
          return `@${node.target}`
        case 'break':
          return '\n'
      }
    })
    .join('')
}
