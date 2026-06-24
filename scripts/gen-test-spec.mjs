// テストファイル（*.test.ts / *.test.tsx / *.spec.*）を走査し、describe / it / test の
// 説明文を集約して Markdown のテスト仕様書を生成するスクリプト。
//
// 背景: テスト名はすべて日本語（CLAUDE.md のテスト規約）で書かれているため、
//       describe をセクション、it / test を仕様項目として並べるだけで
//       「現在保証されている振る舞いの一覧」になる。専用ライブラリは足さず、
//       依存ゼロの自前スクリプトで生成する。
//
// Usage: node scripts/gen-test-spec.mjs
//   出力先: user-docs/test-spec.md

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, relative } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const OUT_FILE = join(root, 'user-docs', 'test-spec.md')

// 走査から除外するディレクトリ。
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.turbo',
  '.pnpm-store',
  '.opencode',
  '.claude',
  'dist',
  'build',
  'coverage',
])

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/

// パスのプレフィックスから、ユーザーに分かりやすい機能エリア名へマッピングする。
// 上から順にマッチした最初のものを採用する。
const AREA_RULES = [
  [/^apps\/web\/src\/app\/api\//, 'API（サーバー処理・権限制御）'],
  [/^apps\/web\/src\/app\//, '画面・ルーティング'],
  [/^apps\/web\/src\/components\//, '画面コンポーネント'],
  [/^apps\/web\/src\/hooks\//, 'データ取得・状態管理（フック）'],
  [/^apps\/web\/src\/lib\/chat\//, 'チャット関連ユーティリティ'],
  [/^apps\/web\/src\/lib\/push\//, '通知・Push 関連'],
  [/^apps\/web\/src\/lib\//, '共通ユーティリティ'],
  [/^packages\/core\//, 'ドメインロジック（core）'],
  [/^packages\/shared\//, '共有バリデーション（shared）'],
  [/^apps\/mobile\//, 'モバイル（Expo）'],
  [/^apps\/desktop\//, 'デスクトップ（Electron）'],
]

function areaOf(relPath) {
  for (const [re, name] of AREA_RULES) {
    if (re.test(relPath)) return name
  }
  return 'その他'
}

function walk(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') && SKIP_DIRS.has(ent.name)) continue
    if (SKIP_DIRS.has(ent.name)) continue
    const p = join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (TEST_FILE_RE.test(ent.name)) out.push(p)
  }
  return out
}

// describe / it / test の呼び出しを行頭からの字下げ込みで拾い、
// describe をネスト見出し、it / test を仕様項目として階層化する。
// 文字列リテラル（' " `）の第1引数のみを対象にする。
function parseBlocks(source) {
  const re =
    /\b(describe|it|test)\s*(\.\w+)?\s*\(\s*(['"`])((?:\\.|(?!\3)[\s\S])*?)\3/g
  const items = []
  let m
  while ((m = re.exec(source))) {
    const kind = m[1] === 'describe' ? 'describe' : 'case'
    const modifier = (m[2] || '').replace(/^\./, '') // skip / only / todo など
    const name = m[4]
      .replace(/\$\{[\s\S]*?\}/g, '${…}')
      .replace(/\s+/g, ' ')
      .trim()
    // ソース上の出現順を保持（深さは波括弧の対応では追わず、出現順のフラットな列として扱う）
    items.push({ kind, modifier, name })
  }
  return items
}

function formatModifier(mod) {
  if (!mod) return ''
  if (mod === 'skip') return ' _(skip)_'
  if (mod === 'todo') return ' _(todo)_'
  if (mod === 'only') return ' _(only)_'
  return ` _(${mod})_`
}

function ensureBlankLine(lines) {
  if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('')
}

function main() {
  const files = walk(root)
    .map((p) => relative(root, p))
    .sort()

  // エリア → ファイル → ブロック の順に集約する。
  const byArea = new Map()
  let totalCases = 0

  for (const rel of files) {
    const source = readFileSync(join(root, rel), 'utf8')
    const blocks = parseBlocks(source)
    if (blocks.length === 0) continue
    const caseCount = blocks.filter((b) => b.kind === 'case').length
    totalCases += caseCount

    const area = areaOf(rel)
    if (!byArea.has(area)) byArea.set(area, [])
    byArea.get(area).push({ rel, blocks, caseCount })
  }

  const areaNames = [...byArea.keys()].sort((a, b) => a.localeCompare(b, 'ja'))

  const now = new Date()
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const lines = []
  lines.push('# テスト仕様書（自動生成）')
  lines.push('')
  lines.push(
    '> このファイルは `scripts/gen-test-spec.mjs` がテストコードから自動生成しています。',
  )
  lines.push(
    '> 直接編集せず、テストを更新してから `pnpm gen:test-spec` を再実行してください。',
  )
  lines.push('')
  lines.push(`- 生成日時: ${stamp}`)
  lines.push(`- 対象テストファイル数: ${files.length}`)
  lines.push(`- 仕様項目（it / test）数: ${totalCases}`)
  lines.push('')

  // 目次
  lines.push('## 目次')
  lines.push('')
  areaNames.forEach((area, index) => {
    lines.push(`- [${area}](#area-${index + 1})`)
  })
  lines.push('')

  lines.push('## 読み方')
  lines.push('')
  lines.push(
    '- このドキュメントは、テストコードに書かれている「確認済みの振る舞い」を一覧化したものです。',
  )
  lines.push(
    '- ユーザー向けの仕様把握を目的にしていますが、自動生成のため一部に API 名・内部用語・テストファイル名が含まれます。',
  )
  lines.push('- 実装やテストと矛盾する場合は、コードとテストを正とします。')
  lines.push('')

  for (const [index, area] of areaNames.entries()) {
    lines.push(`<a id="area-${index + 1}"></a>`)
    lines.push('')
    lines.push(`## ${area}`)
    lines.push('')
    for (const { rel, blocks } of byArea.get(area)) {
      lines.push(`### \`${rel}\``)
      lines.push('')
      for (const b of blocks) {
        if (b.kind === 'describe') {
          ensureBlankLine(lines)
          lines.push(`**${b.name}**${formatModifier(b.modifier)}`)
          lines.push('')
        } else {
          lines.push(`- ${b.name}${formatModifier(b.modifier)}`)
        }
      }
      lines.push('')
    }
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true })
  writeFileSync(
    OUT_FILE,
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n',
  )
  console.log(
    `生成しました: ${relative(root, OUT_FILE)} (${files.length} files, ${totalCases} cases)`,
  )
}

main()
