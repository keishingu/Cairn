import { describe, expect, test } from 'vitest'
import { isMentionLink, toEnrichedMarkdown } from './mobile-markdown-source'

const WJ = '\u2060'
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
    expect(convert('![図](https://example.com/a.png)')).toBe(`!${WJ}[図](https://example.com/a.png)`)
    expect(convert('![](https://example.com/a.png)')).toBe(`!${WJ}[画像](https://example.com/a.png)`)
    expect(convert('![図][ref]\n\n[ref]: https://example.com/a.png')).toBe(
      `!${WJ}[図][ref]\n\n[ref]: https://example.com/a.png`,
    )
  })

  test('コード判定が md4c とずれても画像構文が残らないよう、コードの中でも画像を無効にする', () => {
    // リスト項目内のフェンスは項目の終わりで閉じるが、行単位の判定では開いたままに見える
    expect(convert('- a\n\n  ```\n![x](https://evil.example/p.png)')).toBe(
      `- a\n\n  \`\`\`\n!${WJ}[x](https://evil.example/p.png)`,
    )
    expect(convert('`` ` ![x](y)')).toBe(`\`\` \` !${WJ}[x](y)`)
    expect(convert('```\n![x](y)\n```')).toBe(`\`\`\`\n!${WJ}[x](y)\n\`\`\``)
  })

  test('動画の HTML ブロックはコードの中かどうかに関係なく無効にする', () => {
    expect(convert('```\n<video src="https://evil.example/v.mp4">\n```')).toBe(
      `\`\`\`\n<${WJ}video src="https://evil.example/v.mp4">\n\`\`\``,
    )
    expect(convert('<VIDEO src="x">')).toBe(`\\<${WJ}VIDEO src="x">`)
  })

  test('二重パイプはスポイラーにせず文字として残し、表の行では触らない', () => {
    expect(convert('a || b || c')).toBe('a \\|\\| b \\|\\| c')
    expect(convert('| a || b |\n|---|---|---|\n| 1 || 2 |')).toBe('| a || b |\n|---|---|---|\n| 1 || 2 |')
    // 区切り行がなければ表ではないため、段落としてエスケープする
    expect(convert('| a || b |')).toBe('| a \\|\\| b |')
  })

  test('HTML は捨てられないよう文字として出し、自動リンクはそのまま残す', () => {
    expect(convert('<div>本文</div>')).toBe('\\<div>本文\\</div>')
    expect(convert('<https://example.com> と <a@example.com>')).toBe(
      '<https://example.com> と <a@example.com>',
    )
  })

  test('コードの中は書かれたとおりに残す', () => {
    expect(convert('`<@user-1> a || b`')).toBe('`<@user-1> a || b`')
    expect(convert('```\n<@user-1>\n```\n<@user-1>')).toBe(
      '```\n<@user-1>\n```\n[@山田 太郎](cairn-mention:user-1)',
    )
    expect(convert('``a ` <@user-1>``')).toBe('``a ` <@user-1>``')
    expect(convert('~~~~\n```\n<div>\n~~~~\n<div>')).toBe('~~~~\n```\n<div>\n~~~~\n\\<div>')
  })

  test('先頭の | がない表でも空セルの区切りを残す', () => {
    expect(convert('A || B\n---|---|---\n1 || 2')).toBe('A || B\n---|---|---\n1 || 2')
  })

  test('複数行にまたがるインラインコードの中は変換しない', () => {
    expect(convert('`<@user-1>\ntext` <@user-1>')).toBe(
      '`<@user-1>\ntext` [@山田 太郎](cairn-mention:user-1)',
    )
  })

  test('4スペースのインデントによるコードブロックの中は変換しない（画像だけは無効にする）', () => {
    expect(convert('説明\n\n    <@user-1> a || b\n    ![x](y)\n\n<@user-1>')).toBe(
      `説明\n\n    <@user-1> a || b\n    !${WJ}[x](y)\n\n[@山田 太郎](cairn-mention:user-1)`,
    )
  })

  test('リンク文字列の中のメンションは、リンクの入れ子にならないよう文字として出す', () => {
    expect(convert('[ask <@user-1>](/tasks/1) <@user-1>')).toBe(
      '[ask @山田 太郎](/tasks/1) [@山田 太郎](cairn-mention:user-1)',
    )
  })

  test('省略形の参照リンクと参照定義のラベル内のメンションも、入れ子にならないよう文字として出す', () => {
    expect(convert('[ask <@user-1>]\n\n[ask <@user-1>]: /tasks/1')).toBe(
      '[ask @山田 太郎]\n\n[ask @山田 太郎]: /tasks/1',
    )
  })

  test('コードブロック内の定義に見える行は参照定義として扱わず、同じラベルのメンションはリンクのまま', () => {
    expect(convert('[ask <@user-1>]\n\n```\n[ask <@user-1>]: /tasks/1\n```')).toBe(
      '[ask [@山田 太郎](cairn-mention:user-1)]\n\n```\n[ask <@user-1>]: /tasks/1\n```',
    )
  })

  test('リンク文字列内のインラインコードに ] があっても、後ろのメンションは文字として出す', () => {
    expect(convert('[see `]` <@user-1>](/tasks/1)')).toBe('[see `]` @山田 太郎](/tasks/1)')
  })

  test('リンクにならない [ があっても、後ろのメンションはリンクのまま', () => {
    expect(convert('see arr[0 and <@user-1>')).toBe('see arr[0 and [@山田 太郎](cairn-mention:user-1)')
    expect(convert('[メモ] <@user-1>')).toBe('[メモ] [@山田 太郎](cairn-mention:user-1)')
  })

  test('長い生の URL は Web と同じく50文字で省略し、リンク先は元のまま残す', () => {
    const url = 'https://example.com/path/to/a/very/long/resource?query=1&utm_source=chat'
    const label = `${url.slice(0, 50)}…`.replace(/[.\-_?&=/:]/g, (c) => (/[.\-_]/.test(c) ? `\\${c}` : c))
    expect(convert(`見て ${url} 。`)).toBe(`見て [${label}](<${url}>) 。`)
    expect(convert(`<${url}>`)).toBe(`[${label}](<${url}>)`)
    expect(convert(`[${url}](${url})`)).toBe(`[${label}](${url})`)
  })

  test('URL の一部である対応済みの括弧は残し、文末の句読点と対応しない閉じ括弧だけを外す', () => {
    const paren = 'https://en.wikipedia.org/wiki/Mathematical_analysis_(mathematics)'
    const label = 'https://en\\.wikipedia\\.org/wiki/Mathematical\\_analysi…'
    expect(convert(paren)).toBe(`[${label}](<${paren}>)`)
    expect(convert(`(${paren})`)).toBe(`([${label}](<${paren}>))`)
    expect(convert(`${paren}。`)).toBe(`[${label}](<${paren}>)。`)
  })

  test('強調や取り消し線で囲んだ長い URL は、閉じ記号をリンクの外に残す', () => {
    const url = 'https://example.com/a/very/long/resource/path/that/exceeds/fifty'
    const label = 'https://example\\.com/a/very/long/resource/path/that…'
    expect(convert(`**${url}**`)).toBe(`**[${label}](<${url}>)**`)
    expect(convert(`~~${url}~~`)).toBe(`~~[${label}](<${url}>)~~`)
    expect(convert(`**See ${url}**`)).toBe(`**See [${label}](<${url}>)**`)
    expect(convert(`**bold *See ${url}***`)).toBe(`**bold *See [${label}](<${url}>)***`)
    expect(convert(`***bold** See ${url}*`)).toBe(`***bold** See [${label}](<${url}>)*`)
    const doubled = `${url}**`
    expect(convert(`a*${doubled}`)).toBe(`a*[${label}](<${doubled}>)`)
    const asterisk = `${url}*`
    expect(convert(`glob*.json: ${asterisk}`)).toBe(`glob*.json: [${label}](<${asterisk}>)`)
    expect(convert(`**a** see ${url}**`)).toBe(`**a** see [${label}](<${url}**>)`)
  })

  test('強調で囲まれていない長い URL は、末尾の `_` や `~` も URL の一部として残す', () => {
    const underscore = 'https://example.com/a/very/long/resource/path/that/exceeds/fifty_'
    const tilde = 'https://example.com/a/very/long/resource/path/that/exceeds/fifty~'
    const label = 'https://example\\.com/a/very/long/resource/path/that…'
    expect(convert(underscore)).toBe(`[${label}](<${underscore}>)`)
    expect(convert(`${tilde}。`)).toBe(`[${label}](<${tilde}>)。`)
    expect(convert(`**${underscore}**`)).toBe(`**[${label}](<${underscore}>)**`)
    expect(convert(`prefix_${underscore}`)).toBe(`prefix_[${label}](<${underscore}>)`)
    expect(convert(`Use \`_\` then ${underscore}`)).toBe(`Use \`_\` then [${label}](<${underscore}>)`)
    expect(convert(`\\_ ${underscore}`)).toBe(`\\_ [${label}](<${underscore}>)`)
    expect(convert(`[draft](https://example.com/_open) then ${underscore}`)).toBe(
      `[draft](https://example.com/_open) then [${label}](<${underscore}>)`,
    )
    expect(convert(`https://example.com/_open then ${underscore}`)).toBe(
      `https://example.com/_open then [${label}](<${underscore}>)`,
    )
    expect(convert(`Use _ as a separator, then ${underscore}`)).toBe(
      `Use _ as a separator, then [${label}](<${underscore}>)`,
    )
  })

  test('短い URL・表示名付きリンク・リンク先・コード内の URL は省略しない', () => {
    const url = 'https://example.com/path/to/a/very/long/resource?query=1&utm_source=chat'
    expect(convert('https://example.com/a')).toBe('https://example.com/a')
    expect(convert(`[資料](${url})`)).toBe(`[資料](${url})`)
    expect(convert(`[x]: ${url}\n\n[資料][x]`)).toBe(`[x]: ${url}\n\n[資料][x]`)
    expect(convert(`\`${url}\``)).toBe(`\`${url}\``)
  })

  test('リンク文字列の中の画像は代替テキストだけを残し、外側のリンク先を保つ', () => {
    expect(convert('[see ![alt](https://img.example/x)](https://dest.example)')).toBe(
      '[see alt](https://dest.example)',
    )
    expect(convert('[![](https://img.example/x)](https://dest.example)')).toBe('[画像](https://dest.example)')
    expect(convert('[![logo][img]](https://dest.example)\n\n[img]: https://img.example/x')).toBe(
      '[logo](https://dest.example)\n\n[img]: https://img.example/x',
    )
    expect(convert('[![alt](img "a)b")](https://dest.example)')).toBe('[alt](https://dest.example)')
    expect(convert('[![a\\]b](img)](https://dest.example)')).toBe('[a\\]b](https://dest.example)')
    expect(convert('[![`logo` *v2*](img)](https://dest.example)')).toBe('[logo v2](https://dest.example)')
    expect(convert('[![logo][a\\]b]](https://dest.example)\n\n[a\\]b]: https://img.example/x')).toBe(
      '[logo](https://dest.example)\n\n[a\\]b]: https://img.example/x',
    )
  })

  test('リンク先の ![ は画像の無効化で書き換えず、URL として同じ意味の %21[ にする', () => {
    expect(convert('[artifact](/tasks?query=![x])')).toBe('[artifact](/tasks?query=%21[x])')
    expect(convert('[a]\n\n[a]: /tasks?query=![x]')).toBe('[a]\n\n[a]: /tasks?query=%21[x]')
  })

  test('代替テキストが空の参照形式の画像にもラベルを補う', () => {
    expect(convert('![][asset]\n\n[asset]: https://example.com/a.png')).toBe(
      `!${WJ}[画像][asset]\n\n[asset]: https://example.com/a.png`,
    )
  })

  test('山括弧で囲んだリンク先は HTML としてエスケープしない', () => {
    expect(convert('[task](</tasks/123>) <div>')).toBe('[task](</tasks/123>) \\<div>')
    expect(convert('[ref]: </tasks/1>\n\n[x][ref]')).toBe('[ref]: </tasks/1>\n\n[x][ref]')
  })

  test('閉じていないバッククォートやエスケープ済みの記号は変換しない', () => {
    expect(convert('`未完 <@user-1>')).toBe('`未完 [@山田 太郎](cairn-mention:user-1)')
    expect(convert('\\<@user-1> \\|\\|')).toBe('\\<@user-1> \\|\\|')
  })
})
