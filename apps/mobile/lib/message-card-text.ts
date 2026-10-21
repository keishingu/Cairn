// カード（Block Kit サブセット）の文字を、React Native の入れ子の Text で描ける「書式付きの文字列の並び」にする。
// mrkdwn の解釈は @cairn/shared が持ち、ここは平らにするだけ（Web の MrkdwnView と同じトークン列を描く）。
// コンポーネントのテスト基盤がないため、描画の手前までをこの純粋な関数に寄せてテストする。

import type { MrkdwnInline, RenderText } from '@cairn/shared'

export type TextRun = {
  text: string
  bold?: true
  italic?: true
  strike?: true
  code?: true
  /** リンク。押下時は既存のリンクの開き方（resolveMobileMarkdownLink）に渡す */
  url?: string
  mention?: true
}

export type TextParagraph =
  | { type: 'paragraph' | 'quote'; runs: TextRun[] }
  | { type: 'pre'; text: string }

type Style = Pick<TextRun, 'bold' | 'italic' | 'strike'>

/** nameOf で解決できないメンションは unknownMention（「@メンバー」）にする。素の ID を見せない */
export function cardTextParagraphs(
  text: RenderText,
  nameOf: (userId: string) => string | undefined,
  unknownMention: string,
): TextParagraph[] {
  if (text.kind === 'plain') return [{ type: 'paragraph', runs: [{ text: text.text }] }]
  return text.blocks.map((block) => {
    if (block.type === 'pre') return { type: 'pre', text: block.text }
    return { type: block.type, runs: mergeRuns(flatten(block.children, {}, nameOf, unknownMention)) }
  })
}

function flatten(
  nodes: MrkdwnInline[],
  style: Style,
  nameOf: (userId: string) => string | undefined,
  unknownMention: string,
): TextRun[] {
  return nodes.flatMap((node): TextRun[] => {
    switch (node.type) {
      case 'text':
        return [{ text: node.text, ...style }]
      case 'bold':
        return flatten(node.children, { ...style, bold: true }, nameOf, unknownMention)
      case 'italic':
        return flatten(node.children, { ...style, italic: true }, nameOf, unknownMention)
      case 'strike':
        return flatten(node.children, { ...style, strike: true }, nameOf, unknownMention)
      case 'code':
        return [{ text: node.text, code: true }]
      case 'link':
        return [{ text: node.text, url: node.url, ...style }]
      case 'mention': {
        const name = nameOf(node.userId)
        return [{ text: name ? `@${name}` : unknownMention, mention: true, ...style }]
      }
      case 'broadcast':
        return [{ text: `@${node.target}`, mention: true, ...style }]
      case 'break':
        return [{ text: '\n', ...style }]
    }
  })
}

// 同じ書式の連続した文字はまとめる（Text の入れ子を減らす）
function mergeRuns(runs: TextRun[]): TextRun[] {
  const merged: TextRun[] = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (last && !last.url && !run.url && !last.mention && !run.mention && sameStyle(last, run)) {
      last.text += run.text
    } else {
      merged.push({ ...run })
    }
  }
  return merged
}

function sameStyle(a: TextRun, b: TextRun): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.strike === b.strike && a.code === b.code
}
