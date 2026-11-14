import type { Parents, Root, RootContent } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { newlineToBreak } from 'mdast-util-newline-to-break'
import { toHast } from 'mdast-util-to-hast'
import { toHtml } from 'hast-util-to-html'
import { gfm } from 'micromark-extension-gfm'

// 添付の Markdown ファイルを全画面の WebView で描画する HTML を作る。
// ネイティブの Markdown 描画（EnrichedMarkdownText）は ScrollView で拡大すると文字がぼやけ、
// Android では拡大自体ができないため、PDF・Office と同じく WebView の拡大で読めるようにする。
// パーサーは Web（react-markdown + remark-gfm + remark-breaks）と同じ mdast 系を使う

export type MarkdownDocumentTheme = {
  dark: boolean
  background: string
  surface: string
  text: string
  text2: string
  text3: string
  border: string
  link: string
}

type Options = { imageLabel: string }

// 変換は React Native の JS スレッドで同期的に走り、その間はモーダルを閉じることもできない。
// 記法の多い文書は 100KB で約1秒かかるため、長い議事録（数十KB〜100KB程度）が収まる大きさで打ち切り、
// それより大きいファイルは他のアプリで開いてもらう
export const MARKDOWN_PREVIEW_MAX_BYTES = 300 * 1024

export function canPreviewMarkdown(size: number): boolean {
  return size <= MARKDOWN_PREVIEW_MAX_BYTES
}

// 文字を並べる要素。HTML をここでは文字に、それ以外では段落に変える
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

function transformChildren(parent: Parents, options: Options, inLink: boolean) {
  const phrasing = PHRASING_PARENTS.has(parent.type)
  const childInLink = inLink || parent.type === 'link' || parent.type === 'linkReference'
  parent.children = parent.children.flatMap((child): RootContent[] => {
    switch (child.type) {
      case 'image':
        // 画像は送信者指定の URL を自動取得しない（チャット本文と同じ）。タップで開くリンクにする
        if (childInLink) return [{ type: 'text', value: child.alt || options.imageLabel }]
        return [
          {
            type: 'link',
            url: child.url,
            title: child.title ?? null,
            children: [{ type: 'text', value: child.alt || options.imageLabel }],
          },
        ]
      case 'imageReference':
        if (childInLink) return [{ type: 'text', value: child.alt || options.imageLabel }]
        return [
          {
            type: 'linkReference',
            identifier: child.identifier,
            label: child.label ?? null,
            referenceType: 'full',
            children: [{ type: 'text', value: child.alt || options.imageLabel }],
          },
        ]
      case 'html':
        // 生の HTML は描画せず、本文が黙って消えないよう文字として出す（チャット本文と同じ）
        return phrasing
          ? [{ type: 'text', value: child.value }]
          : [{ type: 'paragraph', children: [{ type: 'text', value: child.value }] }]
      default:
        if ('children' in child) transformChildren(child, options, childInLink)
        return [child]
    }
  }) as typeof parent.children
}

function plainText(node: RootContent | Root): string {
  if ('value' in node && typeof node.value === 'string') return node.value
  if ('children' in node) return node.children.map(plainText).join('')
  return ''
}

// GitHub と同じ規則の見出しの id（小文字化、記号の除去、空白をハイフンに、重複は -1, -2…）。
// JavaScript を無効にした WebView でも目次の `#見出し` リンクで移動できるよう、id を直接付ける
export function headingSlug(text: string, used: Map<string, number>): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-')
  // github-slugger と同じく、作った id も使用済みにして `a-1` という見出しとの重なりを避ける
  let slug = base
  while (used.has(slug)) {
    const next = (used.get(base) ?? 0) + 1
    used.set(base, next)
    slug = `${base}-${next}`
  }
  used.set(slug, 0)
  return slug
}

function addHeadingIds(parent: Parents, used: Map<string, number>) {
  for (const child of parent.children) {
    if (child.type === 'heading') {
      child.data = { ...child.data, hProperties: { ...child.data?.hProperties, id: headingSlug(plainText(child), used) } }
    } else if ('children' in child) {
      addHeadingIds(child, used)
    }
  }
}

export function markdownDocumentBodyHtml(markdown: string, options: Options): string {
  const tree: Root = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })
  transformChildren(tree, options, false)
  addHeadingIds(tree, new Map())
  // 改行1つでも改行として見せる（Web の remark-breaks と同じ）
  newlineToBreak(tree)
  // 生の HTML は上で文字に変えてあるが、念のため HTML として出力させない
  return toHtml(toHast(tree, { allowDangerousHtml: false }))
}

export function buildMarkdownDocumentHtml(
  markdown: string,
  theme: MarkdownDocumentTheme,
  options: Options,
): string {
  const body = markdownDocumentBodyHtml(markdown, options)
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5">
<style>
  :root { color-scheme: ${theme.dark ? 'dark' : 'light'}; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    padding: 16px 16px 32px;
    background: ${theme.background};
    color: ${theme.text2};
    font-family: -apple-system, system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  h1, h2, h3, h4, h5, h6 { color: ${theme.text}; line-height: 1.4; margin: 1.2em 0 0.5em; }
  h1 { font-size: 1.5em; }
  h2 { font-size: 1.3em; }
  h3 { font-size: 1.15em; }
  h4, h5 { font-size: 1em; }
  h6 { font-size: 0.9em; color: ${theme.text3}; }
  body > :first-child { margin-top: 0; }
  p, ul, ol, blockquote, pre, table { margin: 0 0 0.8em; }
  ul, ol { padding-left: 1.5em; }
  li.task-list-item { list-style: none; }
  li.task-list-item input { margin: 0 0.4em 0 -1.3em; vertical-align: middle; }
  strong { color: ${theme.text}; }
  del { color: ${theme.text3}; }
  a { color: ${theme.link}; }
  blockquote { margin-left: 0; padding: 2px 12px; border-left: 3px solid ${theme.border}; background: ${theme.surface}; }
  blockquote > :last-child { margin-bottom: 0; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 0.88em; background: ${theme.surface}; border-radius: 4px; padding: 1px 4px; }
  pre { background: ${theme.surface}; border: 1px solid ${theme.border}; border-radius: 8px; padding: 10px 12px; overflow-x: auto; }
  pre code { background: none; padding: 0; overflow-wrap: normal; }
  table { display: block; overflow-x: auto; border-collapse: collapse; }
  th, td { border: 1px solid ${theme.border}; padding: 5px 8px; overflow-wrap: normal; }
  th { background: ${theme.surface}; color: ${theme.text}; }
  hr { border: none; border-top: 1px solid ${theme.border}; margin: 1.2em 0; }
</style>
</head>
<body>
${body}
</body>
</html>`
}

export type ImageViewerMessage = 'loaded' | 'error' | 'zoomed' | 'fit'

export function parseImageViewerMessage(data: string): ImageViewerMessage | null {
  return data === 'loaded' || data === 'error' || data === 'zoomed' || data === 'fit' ? data : null
}

export function buildImageViewerHtml(imageUri: string, background: string): string {
  // 画像だけを画面に収めて表示し、拡大は WebView のピンチに任せる。
  // 壊れた画像でも WebView の読み込み自体は成功するため、img の成否をアプリへ知らせる
  const src = imageUri.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5">
<style>
  html, body { margin: 0; height: 100%; background: ${background}; }
  body { display: flex; align-items: center; justify-content: center; }
  img { display: block; max-width: 100%; max-height: 100%; }
</style>
</head>
<body><img src="${src}" alt="" onload="window.ReactNativeWebView.postMessage('loaded')" onerror="window.ReactNativeWebView.postMessage('error')">
<script>
  // 拡大中かどうかをアプリへ知らせる（等倍のときだけ横スワイプで画像を送るため）
  if (window.visualViewport) {
    var zoomed = false;
    window.visualViewport.addEventListener('resize', function () {
      var now = window.visualViewport.scale > 1.01;
      if (now === zoomed) return;
      zoomed = now;
      window.ReactNativeWebView.postMessage(now ? 'zoomed' : 'fit');
    });
  }
</script></body>
</html>`
}
