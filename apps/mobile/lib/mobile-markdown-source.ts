import MarkdownIt from 'markdown-it'
import { matchMarkdownMention } from './mobile-chat-state'

// react-native-enriched-markdown はネイティブの md4c でパースするため、JS からパーサーへ
// 規則を足せない。Cairn 固有の表示規則は、渡す前の Markdown 文字列の変換で実現する。

export const MENTION_LINK_SCHEME = 'cairn-mention:'

export function isMentionLink(url: string): boolean {
  return url.startsWith(MENTION_LINK_SCHEME)
}

// リンク文字列として安全に埋め込むため、Markdown の記号をすべてエスケープする
function escapeMarkdownText(value: string): string {
  return value.replace(/[\\`*_{}[\]()<>#+\-.!|~$]/g, (char) => `\\${char}`)
}

// コード・表・段落の範囲を決めるためだけに使う。md4c と完全には一致しないため、
// ずれても通信が起きない表示上の変換（メンション、`||`、HTML）だけをこの範囲に依存させる
const blockParser = new MarkdownIt()

// 画像構文を必ず壊すために `!` と `[` の間へ挟む不可視文字（U+2060 WORD JOINER）。
// コードの内側でも見た目は変わらず、バックスラッシュのように文字として表示されない
const IMAGE_BREAK = '\u2060'

// Web（markdown-content.tsx）と同じく、長い URL は見た目だけ「…」で省略する。リンク先は元のまま
const URL_DISPLAY_MAX = 50
const BARE_URL_PATTERN = /^https?:\/\/[^\s<>"']+/
const URL_TRAILING_SENTENCE_PUNCTUATION = /[.,;:!?>。、，；：！？〉》】］）]$/
const EMPHASIS_MARKER = /[*_~]/

function countChar(value: string, char: string): number {
  return value.split(char).length - 1
}

// 文末の句読点や、URL 内で対応の取れない閉じ括弧だけを外す。
// `.../Function_(mathematics)` のように URL の一部である対応済みの括弧は残す。
// 末尾の `*` `_` `~` は URL に使える文字なので、直前に同じ記号があって強調・取り消し線の
// 閉じ側（`**URL**` など）とみなせるときだけ外す
function trimUrlTrailingPunctuation(url: string, openingMarkers: string): string {
  let result = url
  for (;;) {
    const last = result.at(-1)
    if (!last) return result
    if (last === ')' && countChar(result, ')') > countChar(result, '(')) {
      result = result.slice(0, -1)
      continue
    }
    if (last === ']' && countChar(result, ']') > countChar(result, '[')) {
      result = result.slice(0, -1)
      continue
    }
    if (URL_TRAILING_SENTENCE_PUNCTUATION.test(last)) {
      result = result.slice(0, -1)
      continue
    }
    if (EMPHASIS_MARKER.test(last) && openingMarkers.includes(last)) {
      result = result.slice(0, -1)
      continue
    }
    return result
  }
}

export function truncateUrlForDisplay(url: string): string {
  return url.length > URL_DISPLAY_MAX ? `${url.slice(0, URL_DISPLAY_MAX)}…` : url
}

function shortenedUrlLink(url: string): string {
  return `[${escapeMarkdownText(truncateUrlForDisplay(url))}](<${url}>)`
}

// `(` の位置からリンク先を読み、対応する `)` の位置を返す（括弧の入れ子とエスケープを考慮）
function findDestinationEnd(line: string, open: number): number {
  let depth = 0
  for (let index = open; index < line.length; index += 1) {
    const char = line[index]
    if (char === '\\') {
      index += 1
      continue
    }
    if (char === '\n') return -1
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

const AUTOLINK_PATTERN = /^<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*>/
const EMAIL_AUTOLINK_PATTERN = /^<[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*>/

function findClosingBackticks(line: string, from: number, length: number): number {
  let index = from
  while (index < line.length) {
    const start = line.indexOf('`', index)
    if (start === -1) return -1
    let end = start
    while (line[end] === '`') end += 1
    if (end - start === length) return start
    index = end
  }
  return -1
}

// markdown-it が認識した参照定義（`[ラベル]: リンク先`）のラベル一覧。省略形の参照リンク `[ラベル]` を判別するために使う。
// コードブロック内など定義にならない行は含まれない。照合は CommonMark と同じ正規化（大文字小文字・連続空白を区別しない）
function normalizeReferenceLabel(label: string): string {
  return blockParser.utils.normalizeReference(label)
}

function collectReferenceLabels(env: { references?: Record<string, unknown> }): Set<string> {
  return new Set(Object.keys(env.references ?? {}))
}

// `[` から対応する `]` を探し、リンク文字列（インライン・参照・参照定義）ならその閉じ位置を返す。
// インラインコードの中の括弧はラベルの区切りにならないため読み飛ばす
function findLinkLabelEnd(line: string, start: number, referenceLabels: Set<string>): number {
  let depth = 0
  for (let index = start; index < line.length; index += 1) {
    const char = line[index]
    if (char === '\\') {
      index += 1
      continue
    }
    if (char === '`') {
      const run = /^`+/.exec(line.slice(index))![0]
      const closing = findClosingBackticks(line, index + run.length, run.length)
      index = closing === -1 ? index + run.length - 1 : closing + run.length - 1
      continue
    }
    if (char === '[') depth += 1
    if (char === ']') {
      depth -= 1
      if (depth === 0) {
        const next = line[index + 1]
        if (next === '(' || next === '[') return index
        // 参照定義の行そのもの、または定義のある省略形の参照リンク
        const label = normalizeReferenceLabel(line.slice(start + 1, index))
        return next === ':' || referenceLabels.has(label) ? index : -1
      }
    }
  }
  return -1
}

function transformInline(
  line: string,
  options: {
    resolveMentionName: (userId: string, displayName: string | undefined) => string
    imageLabel: string
    inTableRow: boolean
    referenceLabels: Set<string>
  },
): string {
  let output = ''
  let index = 0
  // リンク文字列（`[...](` / `[...][`）の閉じ位置のスタック。CommonMark はリンクの入れ子を
  // 許さないため、この中のメンションはリンクにせず文字として出す。リンクにならない `[` は数えない
  const labelEnds: number[] = []
  while (index < line.length) {
    const char = line[index]!

    // バックスラッシュエスケープはそのまま残し、次の1文字を変換対象から外す
    if (char === '\\') {
      output += line.slice(index, index + 2)
      index += 2
      continue
    }

    // インラインコードの中身は書かれたとおりに見せる。CommonMark と同じく、
    // 開きと同じ長さのバッククォート列だけを閉じとみなす（長い列の一部では閉じない）
    if (char === '`') {
      const run = /^`+/.exec(line.slice(index))![0]
      const closing = findClosingBackticks(line, index + run.length, run.length)
      if (closing === -1) {
        output += run
        index += run.length
        continue
      }
      output += line.slice(index, closing + run.length)
      index = closing + run.length
      continue
    }

    if (char === '<') {
      const mention = matchMarkdownMention(line, index)
      if (mention) {
        const label = escapeMarkdownText(
          `@${options.resolveMentionName(mention.userId, mention.displayName)}`,
        )
        output +=
          labelEnds.length > 0
            ? label
            : `[${label}](${MENTION_LINK_SCHEME}${encodeURIComponent(mention.userId)})`
        index += mention.length
        continue
      }
      const rest = line.slice(index)
      const autolink = AUTOLINK_PATTERN.exec(rest) ?? EMAIL_AUTOLINK_PATTERN.exec(rest)
      if (autolink) {
        const url = autolink[0].slice(1, -1)
        output +=
          labelEnds.length === 0 && /^https?:\/\//i.test(url) && url.length > URL_DISPLAY_MAX
            ? shortenedUrlLink(url)
            : autolink[0]
        index += autolink[0].length
        continue
      }
      // md4c は <video> 以外の HTML ブロックを描画せずに捨てる。本文が黙って消えないよう文字として出す
      output += '\\<'
      index += 1
      continue
    }

    // リンク文字列の中の画像（`[![alt](画像)](リンク先)` など）は、後段で画像構文を壊すと内側のリンクになり、
    // 入れ子のリンクとして外側のリンク先が失われる。代替テキストだけを文字として残す
    if (char === '!' && line[index + 1] === '[' && labelEnds.length > 0) {
      const altEnd = findLinkLabelEnd(line, index + 1, options.referenceLabels)
      if (altEnd !== -1) {
        let imageEnd = altEnd
        if (line[altEnd + 1] === '(') imageEnd = findDestinationEnd(line, altEnd + 1)
        else if (line[altEnd + 1] === '[') imageEnd = line.indexOf(']', altEnd + 2)
        if (imageEnd !== -1) {
          const alt = line.slice(index + 2, altEnd)
          output += alt ? escapeMarkdownText(alt) : escapeMarkdownText(options.imageLabel)
          index = imageEnd + 1
          continue
        }
      }
    }

    // 代替テキストが空の画像（インライン・参照形式とも）は、リンクに変えたあと文字が無く
    // 見えなくなるためラベルを補う
    if (line.startsWith('![]', index) && (line[index + 3] === '(' || line[index + 3] === '[')) {
      output += `![${escapeMarkdownText(options.imageLabel)}]`
      index += 3
      continue
    }

    if (char === '[') {
      const end = findLinkLabelEnd(line, index, options.referenceLabels)
      // `[URL](URL)` のように表示文字がリンク先そのものなら、生の URL と同じく省略する
      if (end !== -1 && line[end + 1] === '(') {
        const destinationEnd = findDestinationEnd(line, end + 1)
        const label = line.slice(index + 1, end)
        const destination = destinationEnd === -1 ? '' : line.slice(end + 2, destinationEnd).trim()
        if (
          destinationEnd !== -1 &&
          label === destination &&
          BARE_URL_PATTERN.test(label) &&
          label.length > URL_DISPLAY_MAX
        ) {
          output += `[${escapeMarkdownText(truncateUrlForDisplay(label))}](${line.slice(end + 2, destinationEnd)})`
          index = destinationEnd + 1
          continue
        }
      }
      if (end !== -1) labelEnds.push(end)
      output += char
      index += 1
      continue
    }

    if (char === ']') {
      if (labelEnds[labelEnds.length - 1] === index) labelEnds.pop()
      output += char
      index += 1
      // `](...)` のリンク先と参照定義の `]: ...` は、そのまま残す。山括弧付きのリンク先を
      // HTML としてエスケープしたり、リンク先の URL を省略表示のリンクに変えたりしない
      if (line[index] === '(') {
        const destinationEnd = findDestinationEnd(line, index)
        if (destinationEnd !== -1) {
          output += line.slice(index, destinationEnd + 1)
          index = destinationEnd + 1
        }
        continue
      }
      const definition = /^:[ \t]*(?:<[^<>\n]*>|\S+)/.exec(line.slice(index))
      if (definition) {
        output += definition[0]
        index += definition[0].length
      }
      continue
    }

    // 生の URL（md4c が自動リンクにするもの）は長ければ省略表示のリンクにする。
    // リンク文字列の中や単語の途中は対象外
    if (
      (char === 'h' || char === 'H') &&
      labelEnds.length === 0 &&
      !/[A-Za-z0-9]/.test(line[index - 1] ?? '')
    ) {
      const match = BARE_URL_PATTERN.exec(line.slice(index))
      if (match) {
        const before = line.slice(0, index)
        let openingMarkers = /[*_~]*$/.exec(before)?.[0] ?? ''
        // `_` は単語の途中（`prefix_https://…` など）では強調を開かないため、閉じ記号の根拠にしない
        if (/[\p{L}\p{N}]/u.test(before.at(-openingMarkers.length - 1) ?? '')) {
          openingMarkers = openingMarkers.replaceAll('_', '')
        }
        const url = trimUrlTrailingPunctuation(match[0], openingMarkers)
        output += url.length > URL_DISPLAY_MAX ? shortenedUrlLink(url) : url
        index += url.length
        continue
      }
    }

    // md4c は `||` を常にスポイラーとして扱う。チャットでは意図しない伏せ字になるため文字として出す。
    // 表の行では空セルの区切りなので触らない
    if (char === '|' && line[index + 1] === '|' && !options.inTableRow) {
      output += '\\|\\|'
      index += 2
      continue
    }

    output += char
    index += 1
  }
  return output
}

export function toEnrichedMarkdown(
  content: string,
  options: {
    resolveMentionName: (userId: string, displayName: string | undefined) => string
    imageLabel: string
  },
): string {
  const lines = content.split('\n')
  // 行ごとの所属ブロック。コードはそのまま残し、表は `||` を空セルとして残す。
  // 段落・見出しは複数行にまたがるインラインコードを扱えるよう、まとめて変換する
  const blocks: Array<{ kind: 'text' | 'table' | 'code'; id: number }> = lines.map((_, index) => ({
    kind: 'text',
    id: -1 - index,
  }))
  const env: { references?: Record<string, unknown> } = {}
  const tokens = blockParser.parse(content, env)
  const referenceLabels = collectReferenceLabels(env)
  tokens.forEach((token, tokenIndex) => {
    if (!token.map) return
    const [from, to] = token.map
    const kind =
      token.type === 'fence' || token.type === 'code_block'
        ? 'code'
        : token.type === 'table_open'
          ? 'table'
          : token.type === 'inline'
            ? 'text'
            : null
    if (!kind) return
    for (let line = from; line < to && line < lines.length; line += 1) {
      // 表の中のセルも inline を持つため、先に決まった表・コードを上書きしない
      if (kind === 'text' && blocks[line]!.kind !== 'text') continue
      blocks[line] = { kind, id: kind === 'table' ? -1 - line : tokenIndex }
    }
  })

  const output: string[] = []
  let index = 0
  while (index < lines.length) {
    const block = blocks[index]!
    let end = index + 1
    while (end < lines.length && blocks[end]!.kind === block.kind && blocks[end]!.id === block.id) {
      end += 1
    }
    const chunk = lines.slice(index, end).join('\n')
    output.push(
      block.kind === 'code'
        ? chunk
        : transformInline(chunk, { ...options, inTableRow: block.kind === 'table', referenceLabels }),
    )
    index = end
  }

  return output
    .join('\n')
    // 画像は送信者指定の URL を自動取得しない。md4c のブロック解釈（コードの範囲など）を JS で
    // 完全には再現できないため、行ごとの判定に頼らず本文全体で画像構文を壊す。
    // 結果はリンクになり、タップしたときだけ通常のリンク判定で開く
    .replaceAll('![', `!${IMAGE_BREAK}[`)
    // <video> だけは HTML ブロックとして動画プレイヤーになるため、同じく本文全体で無効にする
    .replace(/<(\s*\/?\s*video)/gi, `<${IMAGE_BREAK}$1`)
}
