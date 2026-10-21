// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { mrkdwnToPlainText, parseMrkdwn, parseMrkdwnInline } from './mrkdwn'

describe('mrkdwn の書式', () => {
  it('太字・斜体・取り消し・コードを解釈する', () => {
    expect(parseMrkdwnInline('*太字* _斜体_ ~取消~ `x*y*`')).toEqual([
      { type: 'bold', children: [{ type: 'text', text: '太字' }] },
      { type: 'text', text: ' ' },
      { type: 'italic', children: [{ type: 'text', text: '斜体' }] },
      { type: 'text', text: ' ' },
      { type: 'strike', children: [{ type: 'text', text: '取消' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'x*y*' },
    ])
  })

  it('日本語の文中でも書式を効かせる', () => {
    expect(parseMrkdwnInline('これは*太字*です')).toEqual([
      { type: 'text', text: 'これは' },
      { type: 'bold', children: [{ type: 'text', text: '太字' }] },
      { type: 'text', text: 'です' },
    ])
  })

  it('英数字に挟まれた記号は書式にしない', () => {
    expect(parseMrkdwnInline('snake_case_name と 2*3*4')).toEqual([{ type: 'text', text: 'snake_case_name と 2*3*4' }])
  })

  it('空白で始まる・終わる記号は書式にしない', () => {
    expect(parseMrkdwnInline('* 箇条 *')).toEqual([{ type: 'text', text: '* 箇条 *' }])
  })

  it('書式を入れ子にできる', () => {
    expect(parseMrkdwnInline('*太字の中の _斜体_*')).toEqual([
      {
        type: 'bold',
        children: [
          { type: 'text', text: '太字の中の ' },
          { type: 'italic', children: [{ type: 'text', text: '斜体' }] },
        ],
      },
    ])
  })

  it('リンクの中の記号を閉じ記号に数えない', () => {
    expect(parseMrkdwnInline('*<https://example.com/a*b|リンク>*')).toEqual([
      { type: 'bold', children: [{ type: 'link', url: 'https://example.com/a*b', text: 'リンク' }] },
    ])
  })

  it('閉じていない記号は文字として残す', () => {
    expect(parseMrkdwnInline('*閉じない')).toEqual([{ type: 'text', text: '*閉じない' }])
  })
})

describe('mrkdwn のタグ', () => {
  it('メンション・一斉通知・リンクを解釈する', () => {
    expect(parseMrkdwnInline('<@u1> <@u2|旧名> <!here> <https://example.com> <mailto:a@example.com|メール>')).toEqual([
      { type: 'mention', userId: 'u1' },
      { type: 'text', text: ' ' },
      { type: 'mention', userId: 'u2' },
      { type: 'text', text: ' ' },
      { type: 'broadcast', target: 'here' },
      { type: 'text', text: ' ' },
      { type: 'link', url: 'https://example.com', text: 'https://example.com' },
      { type: 'text', text: ' ' },
      { type: 'link', url: 'mailto:a@example.com', text: 'メール' },
    ])
  })

  it('javascript: などのスキームはリンクにしない', () => {
    expect(parseMrkdwnInline('<javascript:alert(1)|押して>')).toEqual([{ type: 'text', text: '押して' }])
  })

  it('チャンネル参照は表示名だけを文字で出す', () => {
    expect(parseMrkdwnInline('<#C123|登山本部>')).toEqual([{ type: 'text', text: '登山本部' }])
  })

  it('文字参照を戻す', () => {
    expect(parseMrkdwnInline('a &lt;b&gt; &amp; c')).toEqual([{ type: 'text', text: 'a <b> & c' }])
  })
})

describe('mrkdwn の URL の自動リンク', () => {
  it('本文の https URL をリンクにし、文末の句読点は含めない', () => {
    expect(parseMrkdwnInline('詳細は https://example.com/a。')).toEqual([
      { type: 'text', text: '詳細は ' },
      { type: 'link', url: 'https://example.com/a', text: 'https://example.com/a' },
      { type: 'text', text: '。' },
    ])
  })

  it('verbatim なら自動リンクしない', () => {
    expect(parseMrkdwn('https://example.com', { verbatim: true })).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: 'https://example.com' }] },
    ])
  })
})

describe('mrkdwn のブロック', () => {
  it('改行・引用・複数行コードを分ける', () => {
    expect(parseMrkdwn('1行目\n2行目\n> 引用\n&gt; 続き\n```\nconst a = 1\n```')).toEqual([
      {
        type: 'paragraph',
        children: [{ type: 'text', text: '1行目' }, { type: 'break' }, { type: 'text', text: '2行目' }],
      },
      {
        type: 'quote',
        children: [{ type: 'text', text: '引用' }, { type: 'break' }, { type: 'text', text: '続き' }],
      },
      { type: 'pre', text: 'const a = 1' },
    ])
  })

  it('``` の前後の改行を空行にしない', () => {
    const blocks = parseMrkdwn('前\n```\ncode\n```\n後')
    expect(blocks).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: '前' }] },
      { type: 'pre', text: 'code' },
      { type: 'paragraph', children: [{ type: 'text', text: '後' }] },
    ])
    expect(mrkdwnToPlainText(blocks, () => '')).toBe('前\ncode\n後')
  })

  it('閉じていない ``` は文字として残す', () => {
    expect(parseMrkdwn('a ```b')).toEqual([{ type: 'paragraph', children: [{ type: 'text', text: 'a ```b' }] }])
  })

  it('書式を落とした文字列に戻す', () => {
    const blocks = parseMrkdwn('*担当* <@u1> へ\n<!here>')
    expect(mrkdwnToPlainText(blocks, (id) => (id === 'u1' ? '山田' : '不明'))).toBe('担当 @山田 へ\n@here')
  })
})

describe('mrkdwn の解析時間', () => {
  // 本文はアプリが送る未信頼の値。閉じ記号の探索で行を繰り返し走査すると、細工した本文で描画が固まる
  it('閉じない記号と開いたタグが大量にある本文でもすぐに終わる', () => {
    const hostile = ['*a'.repeat(1500), '<*'.repeat(1500), '`*_'.repeat(1000), ' *x'.repeat(1000)]
    const started = Date.now()
    for (const text of hostile) parseMrkdwn(text.slice(0, 3000))
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('入れ子が上限（4段）に達したら、それより深い記号は文字として残す', () => {
    expect(parseMrkdwnInline('*x*', true, 3)).toEqual([{ type: 'bold', children: [{ type: 'text', text: 'x' }] }])
    expect(parseMrkdwnInline('*x*', true, 4)).toEqual([{ type: 'text', text: '*x*' }])
  })
})

