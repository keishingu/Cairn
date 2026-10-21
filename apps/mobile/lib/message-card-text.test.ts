import { describe, expect, it } from 'vitest'
import { normalizeMessageBlocks, parseMrkdwn, type RenderBlock, type RenderText } from '@cairn/shared'
import { MESSAGE_BLOCK_FIXTURES, pollCardFixture } from '@cairn/shared/blocks/fixtures'
import { cardTextParagraphs } from './message-card-text'

const MENTION_USER_ID = '00000000-0000-4000-8000-000000000001'
const nameOf = (id: string) => (id === MENTION_USER_ID ? '山田' : undefined)

function mrkdwn(source: string): RenderText {
  return { kind: 'mrkdwn', blocks: parseMrkdwn(source) }
}

function textsOf(block: RenderBlock): RenderText[] {
  switch (block.type) {
    case 'section':
      return [...(block.text ? [block.text] : []), ...block.fields]
    case 'context':
      return block.elements.flatMap((element) => (element.type === 'text' ? [element.text] : []))
    default:
      return []
  }
}

describe('カードの文字の平坦化', () => {
  it('全 fixture の文字を例外なく平坦化できる（Web と同じ fixture でネイティブの描画手前まで確かめる）', () => {
    for (const fixture of Object.values(MESSAGE_BLOCK_FIXTURES)) {
      for (const block of normalizeMessageBlocks(fixture).blocks) {
        for (const text of textsOf(block)) expect(() => cardTextParagraphs(text, nameOf, '@メンバー')).not.toThrow()
      }
    }
  })

  it('投票カードの本文で、太字とメンションを書式付きの文字にする', () => {
    const body = normalizeMessageBlocks(pollCardFixture).blocks[1]!
    expect(body.type).toBe('section')
    const [paragraph] = cardTextParagraphs(textsOf(body)[0]!, nameOf, '@メンバー')
    expect(paragraph).toEqual({
      type: 'paragraph',
      runs: [
        { text: '下山連絡の電話当番です。' },
        { text: '担当できる週', bold: true },
        { text: 'に投票してください。 ' },
        { text: '@山田', mention: true },
      ],
    })
  })

  it('解決できないメンションは素の ID を見せず、代わりの表示にする', () => {
    const [paragraph] = cardTextParagraphs(mrkdwn('<@unknown-id> さん'), nameOf, '@メンバー')
    expect(paragraph).toEqual({ type: 'paragraph', runs: [{ text: '@メンバー', mention: true }, { text: ' さん' }] })
  })

  it('入れ子の書式を重ねて持ち、リンク・コード・改行を分ける', () => {
    expect(cardTextParagraphs(mrkdwn('*太字の _斜体_* `x` <https://example.com|リンク>\n次'), nameOf, '@メンバー')).toEqual([
      {
        type: 'paragraph',
        runs: [
          { text: '太字の ', bold: true },
          { text: '斜体', bold: true, italic: true },
          { text: ' ' },
          { text: 'x', code: true },
          { text: ' ' },
          { text: 'リンク', url: 'https://example.com' },
          { text: '\n次' },
        ],
      },
    ])
  })

  it('太字の中のインラインコードは太字を保つ', () => {
    expect(cardTextParagraphs(mrkdwn('*前 `x` 後*'), nameOf, '@メンバー')).toEqual([
      { type: 'paragraph', runs: [{ text: '前 ', bold: true }, { text: 'x', code: true, bold: true }, { text: ' 後', bold: true }] },
    ])
  })

  it('引用と複数行コードを段落として分ける', () => {
    expect(cardTextParagraphs(mrkdwn('> 引用\n```\ncode\n```'), nameOf, '@メンバー')).toEqual([
      { type: 'quote', runs: [{ text: '引用' }] },
      { type: 'pre', text: 'code' },
    ])
  })

  it('plain_text は書式を解釈しない', () => {
    expect(cardTextParagraphs({ kind: 'plain', text: '*そのまま*' }, nameOf, '@メンバー')).toEqual([
      { type: 'paragraph', runs: [{ text: '*そのまま*' }] },
    ])
  })
})
