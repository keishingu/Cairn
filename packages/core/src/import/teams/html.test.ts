// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { teamsReactionToEmoji } from './emoji'
import { decodeEntities, escapeMarkdownText, teamsHtmlToText } from './html'

describe('teamsHtmlToText: サニタイズ', () => {
  test('HTML タグを残さない', () => {
    const { text } = teamsHtmlToText('<div><p onclick="x()">本文<img src="x" onerror="alert(1)"></p><iframe src="https://evil"></iframe></div>')
    expect(text).toBe('本文')
    expect(text).not.toMatch(/<[a-z]/i)
  })

  test('script・style・コメントは中身ごと捨てる', () => {
    expect(teamsHtmlToText('a<script>alert(1)</script>b<style>p{}</style>c<!-- secret -->').text).toBe('abc')
  })

  test('エンティティで書かれたタグも文字として表示され、HTML にならない', () => {
    const { text } = teamsHtmlToText('<p>&lt;img src=x onerror=alert(1)&gt;</p>')
    expect(text).toBe('\\<img src=x onerror=alert(1)\\>')
  })

  test('javascript: や data: のリンクはリンクにしない', () => {
    expect(teamsHtmlToText('<a href="javascript:alert(1)">押す</a>').text).toBe('押す')
    expect(teamsHtmlToText('<a href="data:text/html,x">押す</a>').text).toBe('押す')
  })

  test('リンク先の括弧や空白は Markdown を壊さないようエンコードする', () => {
    expect(teamsHtmlToText('<a href="https://example.com/a (1)">資料</a>').text).toBe('[資料](https://example.com/a%20%281%29)')
  })

  test('URL がそのまま表示されたリンクは自動リンクにする', () => {
    expect(teamsHtmlToText('<a href="https://example.com/x">https://example.com/x</a>').text).toBe('<https://example.com/x>')
  })
})

describe('teamsHtmlToText: 構造', () => {
  test('段落と改行を保つ', () => {
    expect(teamsHtmlToText('<p>1行目</p><p>2行目<br>3行目</p>').text).toBe('1行目\n2行目\n3行目')
  })

  test('箇条書きを Markdown の箇条書きにする', () => {
    expect(teamsHtmlToText('<ul><li>一</li><li>二</li></ul>').text).toBe('- 一\n- 二')
  })

  test('姓と名に分かれたメンションを1つの @名前 にまとめる', () => {
    const result = teamsHtmlToText('<span itemtype="http://schema.skype.com/Mention" itemid="0">佐藤</span> <span itemtype="http://schema.skype.com/Mention" itemid="1">花子</span> さん')
    expect(result.text).toBe('@佐藤 花子 さん')
    expect(result.mentionCount).toBe(1)
  })

  test('離れた2つのメンションは別々に数える', () => {
    const result = teamsHtmlToText('<span itemtype="http://schema.skype.com/Mention">A</span> と <span itemtype="http://schema.skype.com/Mention">B</span>')
    expect(result.text).toBe('@A と @B')
    expect(result.mentionCount).toBe(2)
  })

  test('AMS の画像と動画の ID を集め、本文からは外す', () => {
    const result = teamsHtmlToText('<p>写真<img itemtype="http://schema.skype.com/AMSImage" src="https://us-api.asm.skype.com/v1/objects/0-wus-d1-abc/views/imgo"></p><video itemtype="http://schema.skype.com/AMSVideo" src="https://us-api.asm.skype.com/v1/objects/0-wus-d2-def/views/video">x</video>')
    expect(result.mediaObjectIds).toEqual(['0-wus-d1-abc', '0-wus-d2-def'])
    expect(result.text).toBe('写真')
  })
})

describe('decodeEntities / escapeMarkdownText', () => {
  test('数値・名前付きエンティティを戻し、制御文字は落とす', () => {
    expect(decodeEntities('&amp;&#x41;&#66;&nbsp;&#1;&unknown;')).toBe('&AB &unknown;')
  })

  test('メンション・リンク・強調の記号をエスケープする', () => {
    expect(escapeMarkdownText('<@id> [a](b) *c* _d_ `e`')).toBe('\\<\u2060@id\\> \\[a\\](b) \\*c\\* \\_d\\_ \\`e\\`')
  })

  test('エンティティに見える & は &amp; にし、表示で別の文字に化けないようにする', () => {
    expect(escapeMarkdownText('A&B &lt; &#60;')).toBe('A&B &amp;lt; &amp;#60;')
  })
})

describe('teamsReactionToEmoji', () => {
  test.each([
    ['like', '👍'],
    ['heart', '❤️'],
    ['2705_whiteheavycheckmark', '✅'],
    ['1f600_grinning', '😀'],
  ])('%s → %s', (key, emoji) => {
    expect(teamsReactionToEmoji(key)).toBe(emoji)
  })

  test('対応表に無い名前は推測せず :名前: で残す', () => {
    expect(teamsReactionToEmoji('somethingnew')).toBe(':somethingnew:')
  })
})
