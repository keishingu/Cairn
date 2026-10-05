import type { Parent, PhrasingContent, Root, RootContent, Text } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown, gfmToMarkdown } from 'mdast-util-gfm'
import { toMarkdown } from 'mdast-util-to-markdown'
import { gfm } from 'micromark-extension-gfm'

// react-native-enriched-markdown はネイティブの md4c でパースするため、JS からパーサーへ
// 規則を足せない。Cairn 固有の表示規則は、Web（react-markdown + remark-gfm）と同じパーサーで
// 構文木にしてから適用し、エスケープ済みの Markdown に戻して md4c に渡す。
// 強調・リンク・URL・コードの範囲は CommonMark / GFM のパーサーが決めるため、手書きで真似しない

export const MENTION_LINK_SCHEME = 'cairn-mention:'

export function isMentionLink(url: string): boolean {
  return url.startsWith(MENTION_LINK_SCHEME)
}

// Web（markdown-content.tsx）と同じく、長い URL は見た目だけ「…」で省略する。リンク先は元のまま
const URL_DISPLAY_MAX = 50

export function truncateUrlForDisplay(url: string): string {
  return url.length > URL_DISPLAY_MAX ? `${url.slice(0, URL_DISPLAY_MAX)}…` : url
}

// Web と同じ構造化メンション。canonical な `<@userId>` と旧形式 `<@userId|displayName>`
const MENTION_PATTERN = /<@([^|>\s]+)(?:\|([^>\n]+))?>/g

// 画像構文を必ず壊すために `!` と `[` の間へ挟む不可視文字（U+2060 WORD JOINER）。
// コードの内側でも見た目は変わらず、バックスラッシュのように文字として表示されない
const IMAGE_BREAK = '⁠'

// 文字を並べる要素（段落・見出し・表のセル・リンクなど）。HTML をここでは文字に、それ以外では段落に変える
const PHRASING_PARENTS = new Set([
  'paragraph',
  'heading',
  'tableCell',
  'emphasis',
  'strong',
  'delete',
  'link',
  'linkReference',
])

type Options = {
  resolveMentionName: (userId: string, displayName: string | undefined) => string
  imageLabel: string
}

function text(value: string): Text {
  return { type: 'text', value }
}

// 本文全体の画像構文の無効化（後段）がリンク先を書き換えないよう、
// リンク先の `![` は URL として同じ意味の `%21[` にしておく
function protectDestination(url: string): string {
  return url.replaceAll('![', '%21[')
}

// テキストの中のメンションを表示名に変える。リンクの中では入れ子のリンクにならないよう文字のまま出す
function splitMentions(value: string, options: Options, inLink: boolean): PhrasingContent[] {
  const result: PhrasingContent[] = []
  let last = 0
  for (const match of value.matchAll(MENTION_PATTERN)) {
    const start = match.index
    if (start > last) result.push(text(value.slice(last, start)))
    const label = `@${options.resolveMentionName(match[1]!, match[2])}`
    result.push(
      inLink
        ? text(label)
        : { type: 'link', url: `${MENTION_LINK_SCHEME}${match[1]}`, children: [text(label)] },
    )
    last = start + match[0].length
  }
  if (last === 0) return [text(value)]
  if (last < value.length) result.push(text(value.slice(last)))
  return result
}

function transformChildren(parent: Parent, options: Options, inLink: boolean): void {
  const phrasing = PHRASING_PARENTS.has(parent.type)
  parent.children = parent.children.flatMap((child) =>
    transformNode(child as RootContent, options, inLink, phrasing),
  ) as Parent['children']
}

function transformNode(
  node: RootContent,
  options: Options,
  inLink: boolean,
  phrasing: boolean,
): RootContent[] {
  switch (node.type) {
    case 'text':
      return splitMentions(node.value, options, inLink)
    case 'image': {
      // 画像は送信者指定の URL を自動取得しない。タップで開くリンクにし、リンクの中では代替テキストだけを残す
      const label = node.alt || options.imageLabel
      if (inLink) return [text(label)]
      return [{ type: 'link', url: protectDestination(node.url), title: node.title, children: [text(label)] }]
    }
    case 'imageReference': {
      const label = node.alt || options.imageLabel
      if (inLink) return [text(label)]
      return [
        {
          type: 'linkReference',
          identifier: node.identifier,
          label: node.label,
          referenceType: 'full',
          children: [text(label)],
        },
      ]
    }
    case 'html':
      // md4c は <video> 以外の HTML を描画せずに捨てる。本文が黙って消えないよう文字として出す
      return phrasing ? [text(node.value)] : [{ type: 'paragraph', children: [text(node.value)] }]
    case 'link': {
      node.url = protectDestination(node.url)
      transformChildren(node, options, true)
      // 自動リンクなど表示文字がリンク先そのものの長い URL は、Web と同じく見た目だけ省略する
      const only = node.children.length === 1 ? node.children[0] : undefined
      if (only?.type === 'text' && only.value === node.url && /^https?:\/\//i.test(node.url)) {
        only.value = truncateUrlForDisplay(only.value)
      }
      return [node]
    }
    case 'linkReference':
      transformChildren(node, options, true)
      return [node]
    case 'definition':
      node.url = protectDestination(node.url)
      return [node]
    case 'code':
    case 'inlineCode':
      return [node]
    default:
      if ('children' in node) transformChildren(node, options, inLink)
      return [node]
  }
}

export function toEnrichedMarkdown(content: string, options: Options): string {
  const tree: Root = fromMarkdown(content, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })
  transformChildren(tree, options, false)

  const markdown = toMarkdown(tree, {
    extensions: [gfmToMarkdown()],
    bullet: '-',
    emphasis: '*',
    strong: '*',
    fence: '`',
    fences: true,
    rule: '-',
    listItemIndent: 'one',
    unsafe: [
      // md4c は `||` を常にスポイラーとして扱う。チャットでは意図しない伏せ字になるため文字として出す
      { character: '|', after: '\\|' },
    ],
  }).replace(/\n+$/, '')

  return (
    markdown
      // 構文木の上で画像はリンクに変えてある。md4c とのパーサー差異に備えた安全策として、
      // 本文全体（コードの中も含む）でも画像構文を壊す
      .replaceAll('![', `!${IMAGE_BREAK}[`)
      // <video> だけは HTML ブロックとして動画プレイヤーになるため、同じく本文全体で無効にする
      .replace(/<(\s*\/?\s*video)/gi, `<${IMAGE_BREAK}$1`)
  )
}
