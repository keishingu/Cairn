import { describe, expect, test } from 'vitest'
import { isMentionLink, toEnrichedMarkdown } from './mobile-markdown-source'

const names: Record<string, string> = { 'user-1': '山田 太郎' }

function convert(content: string) {
  return toEnrichedMarkdown(content, {
    resolveMentionName: (userId, displayName) => names[userId] ?? displayName ?? 'メンバー',
    imageLabel: '画像',
  })
}

describe('toEnrichedMarkdown', () => {
  test('メンションを表示名のリンクに変え、メンション用スキームで識別できる', () => {
    expect(convert('こんにちは <@user-1> さん')).toBe(
      'こんにちは [@山田 太郎](cairn-mention:user-1) さん',
    )
    expect(isMentionLink('cairn-mention:user-1')).toBe(true)
    expect(isMentionLink('https://example.com')).toBe(false)
  })

  test('メンバー一覧にない場合は本文中の表示名、それもなければ既定の名前を使う', () => {
    expect(convert('<@user-2|佐藤>')).toBe('[@佐藤](cairn-mention:user-2)')
    expect(convert('<@user-3>')).toBe('[@メンバー](cairn-mention:user-3)')
  })

  test('表示名に含まれる Markdown 記号はリンク文字列を壊さないようエスケープする', () => {
    expect(convert('<@user-4|a]b*c>')).toBe('[@a\\]b\\*c](cairn-mention:user-4)')
  })

  test('画像は自動取得させず、タップで開くリンクに変える', () => {
    expect(convert('![図](https://example.com/a.png)')).toBe('\\![図](https://example.com/a.png)')
    expect(convert('![](https://example.com/a.png)')).toBe('\\![画像](https://example.com/a.png)')
    expect(convert('![図][ref]\n\n[ref]: https://example.com/a.png')).toBe(
      '\\![図][ref]\n\n[ref]: https://example.com/a.png',
    )
  })

  test('二重パイプはスポイラーにせず文字として残し、表の行では触らない', () => {
    expect(convert('a || b || c')).toBe('a \\|\\| b \\|\\| c')
    expect(convert('| a || b |')).toBe('| a || b |')
  })

  test('HTML は捨てられないよう文字として出し、自動リンクはそのまま残す', () => {
    expect(convert('<div>本文</div>')).toBe('\\<div>本文\\</div>')
    expect(convert('<https://example.com> と <a@example.com>')).toBe(
      '<https://example.com> と <a@example.com>',
    )
  })

  test('コードの中は書かれたとおりに残す', () => {
    expect(convert('`<@user-1> ![x](y) a || b`')).toBe('`<@user-1> ![x](y) a || b`')
    expect(convert('```\n<@user-1>\n![x](y)\n```\n<@user-1>')).toBe(
      '```\n<@user-1>\n![x](y)\n```\n[@山田 太郎](cairn-mention:user-1)',
    )
    expect(convert('~~~~\n```\n<div>\n~~~~\n<div>')).toBe('~~~~\n```\n<div>\n~~~~\n\\<div>')
  })

  test('閉じていないバッククォートやエスケープ済みの記号は変換しない', () => {
    expect(convert('`未完 <@user-1>')).toBe('`未完 [@山田 太郎](cairn-mention:user-1)')
    expect(convert('\\<@user-1> \\![x](y)')).toBe('\\<@user-1> \\![x](y)')
  })
})
