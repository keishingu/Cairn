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

  test('リンクにならない [ があっても、後ろのメンションはリンクのまま', () => {
    expect(convert('see arr[0 and <@user-1>')).toBe('see arr[0 and [@山田 太郎](cairn-mention:user-1)')
    expect(convert('[メモ] <@user-1>')).toBe('[メモ] [@山田 太郎](cairn-mention:user-1)')
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
