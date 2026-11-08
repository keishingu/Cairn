// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Teams の本文 HTML を Cairn の本文（Markdown として表示されるテキスト）に変換する。
 *
 * 方針:
 * - HTML は一切残さない。タグはすべて外し、意味のあるものだけ Markdown の記法にする
 *   （Cairn の表示は react-markdown で生 HTML を描画しないが、保存する時点で HTML を持たない）
 * - 本文のテキストは Markdown の記号をエスケープする。取り込み元の文字列が Cairn の
 *   メンション（`<@id>`）・リンク・強調として解釈されないようにする
 * - 本文は要約・改変しない。改行と段落だけを整える
 * - DOM に依存しない（ブラウザとサーバーの両方で同じ結果にする）
 */

export interface TeamsHtmlResult {
  text: string
  /** 本文に埋め込まれた画像・動画の AMS オブジェクト ID */
  mediaObjectIds: string[]
  mentionCount: number
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
}

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole
      // 制御文字（改行・タブ以外）は落とす
      if (code < 0x20 && code !== 0x0a && code !== 0x09) return ''
      return String.fromCodePoint(code)
    }
    const named = NAMED_ENTITIES[body.toLowerCase()]
    return named ?? whole
  })
}

/**
 * Markdown・メンション記法として解釈される文字をエスケープする（表示は元の文字のまま）。
 * Cairn は Markdown の描画前後のどちらでも `<@id>` をメンションとして解決するため、
 * `<@` の間には見えない文字（U+2060 WORD JOINER）を入れて、取り込み元の文字列が Cairn のメンションにならないようにする。
 * `&` はエンティティに見える並びのときだけ `&amp;` にする（元の文字列の `&lt;` が `<` に化けないように）。
 */
export const MENTION_BREAKER = '\u2060'

export function escapeMarkdownText(input: string): string {
  return input
    .replace(/&(?=#?[a-z0-9]+;)/gi, '&amp;')
    .replace(/[\\`*_[\]<>|~]/g, ch => `\\${ch}`)
    .replace(/\\<@/g, `\\<${MENTION_BREAKER}@`)
    .replace(/^(\s*)(#{1,6}\s)/gm, '$1\\$2')
    .replace(/^(\s*)(\d+)\.(\s)/gm, '$1$2\\.$3')
    .replace(/^(\s*)([-+])(\s)/gm, '$1\\$2$3')
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

const LINK_URL_ESCAPES: Record<string, string> = { '(': '%28', ')': '%29', ' ': '%20', '<': '%3C', '>': '%3E', '\t': '%09', '\n': '%0A' }

/** Markdown のリンク先として壊れないよう、括弧・空白・山括弧をエンコードする */
export function encodeLinkUrl(url: string): string {
  return url.replace(/[()\s<>]/g, ch => LINK_URL_ESCAPES[ch] ?? encodeURIComponent(ch))
}

function escapeLinkUrl(url: string): string {
  return encodeLinkUrl(url)
}

const AMS_OBJECT_RE = /\/objects\/([A-Za-z0-9-]+)\//

interface Token {
  type: 'open' | 'close' | 'text' | 'selfclose'
  tag?: string
  attrs?: Record<string, string>
  text?: string
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const name = m[1]!.toLowerCase()
    attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return attrs
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = []
  // コメント・script・style は中身ごと捨てる
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned))) {
    if (m.index > last) tokens.push({ type: 'text', text: cleaned.slice(last, m.index) })
    const tag = m[1]!.toLowerCase()
    const rawAttrs = m[2] ?? ''
    if (m[0].startsWith('</')) tokens.push({ type: 'close', tag })
    else if (rawAttrs.trim().endsWith('/') || ['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr'].includes(tag)) {
      tokens.push({ type: 'selfclose', tag, attrs: parseAttrs(rawAttrs.replace(/\/\s*$/, '')) })
    } else tokens.push({ type: 'open', tag, attrs: parseAttrs(rawAttrs) })
    last = re.lastIndex
  }
  if (last < cleaned.length) tokens.push({ type: 'text', text: cleaned.slice(last) })
  return tokens
}

const BLOCK_TAGS = new Set(['p', 'div', 'li', 'tr', 'table', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre'])

/**
 * Teams の HTML を本文テキストに変換する。
 * 引用返信の `<blockquote itemtype=".../Reply">` は引用元への参照で別に扱うため、本文から外す。
 */
export function teamsHtmlToText(html: string): TeamsHtmlResult {
  const tokens = tokenize(html)
  const out: string[] = []
  const mediaObjectIds: string[] = []
  let mentionCount = 0
  // 中身を捨てる要素の入れ子の深さ（引用返信・video など）
  let skipDepth = 0
  const skipStack: string[] = []
  // リンクの文字列を集めるためのスタック
  const linkStack: Array<{ href: string | null; start: number }> = []
  let inMention = false
  let mentionBuffer = ''
  let lastMentionClosedAt = -1

  const pushNewline = () => {
    const joined = out.join('')
    if (joined.length === 0 || joined.endsWith('\n')) return
    out.push('\n')
  }

  for (const token of tokens) {
    if (skipDepth > 0) {
      if (token.type === 'open' && token.tag === skipStack[skipStack.length - 1]) skipDepth++
      if (token.type === 'close' && token.tag === skipStack[skipStack.length - 1]) {
        skipDepth--
        if (skipDepth === 0) skipStack.pop()
      }
      continue
    }

    if (token.type === 'text') {
      const text = decodeEntities(token.text ?? '').replace(/\r\n?/g, '\n')
      if (inMention) mentionBuffer += text
      else out.push(escapeMarkdownText(text))
      continue
    }

    const tag = token.tag!
    const attrs = token.attrs ?? {}
    const itemtype = attrs['itemtype'] ?? ''

    if (token.type === 'open' || token.type === 'selfclose') {
      if (tag === 'blockquote' && itemtype.endsWith('/Reply')) {
        skipDepth = 1
        skipStack.push(tag)
        continue
      }
      if (tag === 'img' || tag === 'video') {
        const src = attrs['src'] ?? ''
        const match = AMS_OBJECT_RE.exec(src)
        if (match && (itemtype.endsWith('/AMSImage') || itemtype.endsWith('/AMSVideo') || src.includes('asm.skype.com') || src.includes('asyncgw'))) {
          if (!mediaObjectIds.includes(match[1]!)) mediaObjectIds.push(match[1]!)
        } else if (itemtype.endsWith('/Emoji') || attrs['alt']) {
          // 絵文字画像は代替テキストで残す
          const alt = attrs['alt'] ?? ''
          if (alt) out.push(escapeMarkdownText(alt))
        }
        if (tag === 'video' && token.type === 'open') {
          skipDepth = 1
          skipStack.push(tag)
        }
        continue
      }
      if (tag === 'span' && itemtype.endsWith('/Mention')) {
        inMention = true
        mentionBuffer = ''
        continue
      }
      if (tag === 'br') {
        out.push('\n')
        continue
      }
      if (tag === 'a') {
        const href = attrs['href'] ?? ''
        linkStack.push({ href: isSafeHttpUrl(href) ? href : null, start: out.length })
        continue
      }
      if (tag === 'strong' || tag === 'b') {
        out.push('**')
        continue
      }
      if (tag === 'li') {
        pushNewline()
        out.push('- ')
        continue
      }
      if (tag === 'td' || tag === 'th') {
        out.push(' ')
        continue
      }
      if (BLOCK_TAGS.has(tag)) pushNewline()
      continue
    }

    // close
    if (tag === 'span' && inMention) {
      inMention = false
      const name = mentionBuffer.replace(/\s+/g, ' ').trim()
      if (name) {
        // 姓と名が別の span に分かれて続くことがある。直前がメンションなら1つにまとめる
        const joined = out.join('')
        if (lastMentionClosedAt === joined.length || (lastMentionClosedAt === joined.length - 1 && joined.endsWith(' '))) {
          out.push((joined.endsWith(' ') ? '' : ' ') + escapeMarkdownText(name))
        } else {
          out.push(`@${escapeMarkdownText(name)}`)
          mentionCount++
        }
        lastMentionClosedAt = out.join('').length
      }
      continue
    }
    if (tag === 'a') {
      const link = linkStack.pop()
      if (link?.href) {
        const label = out.splice(link.start).join('').trim()
        const plainHref = escapeMarkdownText(link.href)
        if (!label || label === plainHref) out.push(`<${escapeLinkUrl(link.href)}>`)
        else out.push(`[${label}](${escapeLinkUrl(link.href)})`)
      }
      continue
    }
    if (tag === 'strong' || tag === 'b') {
      // 中身が空の強調は記号だけ残るので消す
      if (out[out.length - 1] === '**') out.pop()
      else out.push('**')
      continue
    }
    if (BLOCK_TAGS.has(tag)) pushNewline()
  }

  const text = out
    .join('')
    .replace(/[ \t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { text, mediaObjectIds, mentionCount }
}

/** Text 型（プレーンテキスト）の本文を変換する */
export function teamsPlainToText(content: string): string {
  return escapeMarkdownText(decodeEntities(content).replace(/\r\n?/g, '\n')).trim()
}
