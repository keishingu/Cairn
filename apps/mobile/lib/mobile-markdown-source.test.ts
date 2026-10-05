import { describe, expect, test } from 'vitest'
import { isMentionLink, toEnrichedMarkdown } from './mobile-markdown-source'

const WJ = '⁠'
const names: Record<string, string> = { 'user-1': '山田 太郎' }

function convert(content: string) {
  return toEnrichedMarkdown(content, {
    resolveMentionName: (userId, displayName) => names[userId] ?? displayName ?? 'メンバー',
    imageLabel: '画像',
  })
}

const longUrl = 'https://example.com/a/very/long/resource/path/that/exceeds/fifty'
const longLabel = 'https://example.com/a/very/long/resource/path/that…'

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

  test('リンク文字列の中のメンションは、リンクの入れ子にならないよう文字として出す', () => {
    expect(convert('[ask <@user-1>](/tasks/1) <@user-1>')).toBe(
      '[ask @山田 太郎](/tasks/1) [@山田 太郎](cairn-mention:user-1)',
    )
    expect(convert('[see `]` <@user-1>](/tasks/1)')).toBe('[see `]` @山田 太郎](/tasks/1)')
    // 参照リンクは表示文字を変えても参照先を保つ
    expect(convert('[ask <@user-1>]\n\n[ask <@user-1>]: /tasks/1')).toBe(
      '[ask @山田 太郎][ask <@user-1>]\n\n[ask <@user-1>]: /tasks/1',
    )
  })

  test('リンクにならない [ やコードの中のメンションは、パーサーの解釈どおりに扱う', () => {
    expect(convert('see arr[0 and <@user-1>')).toBe('see arr\\[0 and [@山田 太郎](cairn-mention:user-1)')
    expect(convert('`<@user-1> a || b`')).toBe('`<@user-1> a || b`')
    expect(convert('```\n<@user-1>\n```\n\n<@user-1>')).toBe(
      '```\n<@user-1>\n```\n\n[@山田 太郎](cairn-mention:user-1)',
    )
    // 定義に見える行がコードの中にあれば参照リンクにならず、メンションはリンクになる
    expect(convert('[ask <@user-1>]\n\n```\n[ask <@user-1>]: /tasks/1\n```')).toBe(
      '\\[ask [@山田 太郎](cairn-mention:user-1)]\n\n```\n[ask <@user-1>]: /tasks/1\n```',
    )
  })

  test('画像は自動取得させず、タップで開くリンクに変える', () => {
    expect(convert('![図](https://example.com/a.png)')).toBe('[図](https://example.com/a.png)')
    expect(convert('![](https://example.com/a.png)')).toBe('[画像](https://example.com/a.png)')
    expect(convert('![図][ref]\n\n[ref]: https://example.com/a.png')).toBe(
      '[図][ref]\n\n[ref]: https://example.com/a.png',
    )
    expect(convert('![][asset]\n\n[asset]: https://example.com/a.png')).toBe(
      '[画像][asset]\n\n[asset]: https://example.com/a.png',
    )
  })

  test('リンク文字列の中の画像は代替テキストだけを残し、外側のリンク先を保つ', () => {
    expect(convert('[see ![alt](https://img.example/x)](https://dest.example)')).toBe(
      '[see alt](https://dest.example)',
    )
    expect(convert('[![](https://img.example/x)](https://dest.example)')).toBe('[画像](https://dest.example)')
    expect(convert('[![alt](img "a)b")](https://dest.example)')).toBe('[alt](https://dest.example)')
    expect(convert('[![a\\]b](img)](https://dest.example)')).toBe('[a\\]b](https://dest.example)')
  })

  test('パーサーとの差異に備え、コードの中を含む本文全体で画像構文と動画を無効にする', () => {
    expect(convert('```\n![x](y)\n```')).toBe(`\`\`\`\n!${WJ}[x](y)\n\`\`\``)
    expect(convert('```\n<video src="https://evil.example/v.mp4">\n```')).toBe(
      `\`\`\`\n<${WJ}video src="https://evil.example/v.mp4">\n\`\`\``,
    )
    // リスト項目内のフェンスは項目の終わりで閉じるため、後ろの画像もリンクになる
    expect(convert('- a\n\n  ```\n![x](https://evil.example/p.png)')).not.toContain('![')
  })

  test('リンク先の ![ は画像の無効化で書き換えず、URL として同じ意味の %21[ にする', () => {
    expect(convert('[artifact](/tasks?query=![x])')).toBe('[artifact](/tasks?query=%21\\[x])')
    expect(convert('[a]\n\n[a]: /tasks?query=![x]')).toBe('[a]\n\n[a]: /tasks?query=%21[x]')
  })

  test('HTML は捨てられないよう文字として出し、自動リンクはそのまま残す', () => {
    expect(convert('<div>本文</div>')).toBe('\\<div>本文\\</div>')
    expect(convert('<VIDEO src="x">')).toBe(`\\<${WJ}VIDEO src="x">`)
    expect(convert('[task](</tasks/123>) <div>')).toBe('[task](/tasks/123) \\<div>')
    expect(convert('<https://example.com> と <a@example.com>')).toBe(
      '<https://example.com> と <a@example.com>',
    )
  })

  test('二重パイプはスポイラーにせず文字として残し、表では空セルとして扱う', () => {
    expect(convert('a || b || c')).toBe('a \\|| b \\|| c')
    expect(convert('| a || b |\n|---|---|---|\n| 1 || 2 |')).toBe(
      '| a |   | b |\n| - | - | - |\n| 1 |   | 2 |',
    )
  })

  test('長い生の URL は Web と同じく50文字で省略し、リンク先は元のまま残す', () => {
    expect(convert(`見て ${longUrl} 。`)).toBe(`見て [${longLabel}](${longUrl}) 。`)
    expect(convert(`<${longUrl}>`)).toBe(`[${longLabel}](${longUrl})`)
    expect(convert(`[${longUrl}](${longUrl})`)).toBe(`[${longLabel}](${longUrl})`)
  })

  test('短い URL・表示名付きリンク・コード内の URL は省略しない', () => {
    expect(convert('https://example.com/a')).toBe('<https://example.com/a>')
    expect(convert(`[資料](${longUrl})`)).toBe(`[資料](${longUrl})`)
    expect(convert(`\`${longUrl}\``)).toBe(`\`${longUrl}\``)
  })

  test('URL の範囲は GFM の自動リンク規則で決まり、強調や括弧を壊さない', () => {
    expect(convert(`**${longUrl}**`)).toBe(`**[${longLabel}](${longUrl})**`)
    expect(convert(`**See ${longUrl}**`)).toBe(`**See [${longLabel}](${longUrl})**`)
    expect(convert(`~~${longUrl}~~`)).toBe(`~~[${longLabel}](${longUrl})~~`)
    expect(convert(`(${longUrl})`)).toBe(`([${longLabel}](${longUrl}))`)
    const paren = 'https://en.wikipedia.org/wiki/Mathematical_analysis_(mathematics)'
    expect(convert(paren)).toBe(
      `[https://en.wikipedia.org/wiki/Mathematical\\_analysi…](${paren.replace(/[()]/g, '\\$&')})`,
    )
  })

  test('改行・見出し・タスクリスト・引用と強調は構文を保って書き戻す', () => {
    expect(convert('1行目\n2行目')).toBe('1行目\n2行目')
    expect(convert('# 見出し\n\n- [ ] todo\n- [x] done')).toBe('# 見出し\n\n- [ ] todo\n- [x] done')
    expect(convert('> 引用 *強調* _斜体_ ~~取消~~')).toBe('> 引用 *強調* *斜体* ~~取消~~')
  })

  test('長文でも短時間で変換する', () => {
    const content = Array.from(
      { length: 150 },
      () => `[a](https://example.com/_x) ](( ${longUrl}_ <@user-1>`,
    ).join(' ')
    const started = performance.now()
    convert(content)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
