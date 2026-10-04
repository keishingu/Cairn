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

// 画像構文を必ず壊すために `!` と `[` の間へ挟む不可視文字（U+2060 WORD JOINER）。
// コードの内側でも見た目は変わらず、バックスラッシュのように文字として表示されない
const IMAGE_BREAK = '\u2060'

const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/
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

function transformInline(
  line: string,
  options: {
    resolveMentionName: (userId: string, displayName: string | undefined) => string
    imageLabel: string
    inTableRow: boolean
  },
): string {
  let output = ''
  let index = 0
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
        const name = options.resolveMentionName(mention.userId, mention.displayName)
        output += `[${escapeMarkdownText(`@${name}`)}](${MENTION_LINK_SCHEME}${encodeURIComponent(mention.userId)})`
        index += mention.length
        continue
      }
      const rest = line.slice(index)
      const autolink = AUTOLINK_PATTERN.exec(rest) ?? EMAIL_AUTOLINK_PATTERN.exec(rest)
      if (autolink) {
        output += autolink[0]
        index += autolink[0].length
        continue
      }
      // md4c は <video> 以外の HTML ブロックを描画せずに捨てる。本文が黙って消えないよう文字として出す
      output += '\\<'
      index += 1
      continue
    }

    // 代替テキストが空の画像は、リンクに変えたあと文字が無く見えなくなるためラベルを補う
    if (line.startsWith('![](', index)) {
      output += `![${escapeMarkdownText(options.imageLabel)}](`
      index += 4
      continue
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
  let openFence: { char: string; length: number } | null = null

  return lines
    .map((line) => {
      const fence = FENCE_PATTERN.exec(line)
      if (openFence) {
        const run = fence?.[1]
        if (
          run &&
          run[0] === openFence.char &&
          run.length >= openFence.length &&
          line.trim() === run
        ) {
          openFence = null
        }
        return line
      }
      if (fence) {
        const run = fence[1]!
        // バッククォートの info string にバッククォートは含められない（CommonMark）
        if (run[0] !== '`' || !line.slice(fence[0].length).includes('`')) {
          openFence = { char: run[0]!, length: run.length }
          return line
        }
      }
      return transformInline(line, { ...options, inTableRow: /^\s*\|/.test(line) })
    })
    .join('\n')
    // 画像は送信者指定の URL を自動取得しない。md4c のブロック解釈（コードの範囲など）を JS で
    // 完全には再現できないため、行ごとの判定に頼らず本文全体で画像構文を壊す。
    // 結果はリンクになり、タップしたときだけ通常のリンク判定で開く
    .replaceAll('![', `!${IMAGE_BREAK}[`)
    // <video> だけは HTML ブロックとして動画プレイヤーになるため、同じく本文全体で無効にする
    .replace(/<(\s*\/?\s*video)/gi, `<${IMAGE_BREAK}$1`)
}
