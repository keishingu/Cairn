// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { insertLineTaskMarkers, removeLineTaskMarkers, splitLineTaskMarkers, stripLineTaskMarkers } from './line-task-markers'

const M = (index: number) => `${index}`

describe('insertLineTaskMarkers', () => {
  test('指定した行の行末にだけ目印を差し込み、元の本文は変えない', () => {
    const content = '1行目\n- 2行目\n3行目'
    const result = insertLineTaskMarkers(content, [{ lineIndex: 1 }])
    expect(result.text).toBe(`1行目\n- 2行目 ${M(0)}\n3行目`)
    expect(result.placed).toEqual([true])
    expect(content).toBe('1行目\n- 2行目\n3行目')
  })

  test('lineIndex が null か範囲外なら差し込まず、placed を false にする', () => {
    const result = insertLineTaskMarkers('a\nb', [{ lineIndex: null }, { lineIndex: 5 }])
    expect(result.text).toBe('a\nb')
    expect(result.placed).toEqual([false, false])
  })

  test('同じ行に複数あれば順に並べ、行末の空白は除いてから付ける', () => {
    const result = insertLineTaskMarkers('買う  \n次', [{ lineIndex: 0 }, { lineIndex: 0 }])
    expect(result.text).toBe(`買う ${M(0)}${M(1)}\n次`)
  })

  test('空行・表の行・水平線・インデントコードには差し込まない', () => {
    const content = ['', '| a | b |', '|---|---|', '| 1 | 2 |', '', '---', '', '    code', '    - 入れ子', '- ok'].join('\n')
    const result = insertLineTaskMarkers(content, [0, 1, 2, 3, 5, 7, 8, 9].map(lineIndex => ({ lineIndex })))
    // インデントコードの直後の `    - 入れ子` はコードの続きなので差し込まない
    expect(result.placed).toEqual([false, false, false, false, false, false, false, true])
  })

  test('リンク参照定義の行には差し込まず、参照リンクを壊さない', () => {
    // 参照定義は段落の途中では定義にならないため、空行で区切る
    const content = ['[資料][ref] を読む', '', '[ref]: https://example.com', '   [b]: /path "title"'].join('\n')
    const result = insertLineTaskMarkers(content, [0, 2, 3].map(lineIndex => ({ lineIndex })))
    expect(result.placed).toEqual([true, false, false])
    expect(result.text.split('\n').slice(1)).toEqual(['', '[ref]: https://example.com', '   [b]: /path "title"'])
  })

  test('HTML ブロックの行には差し込まず、自動リンクの行には差し込む', () => {
    // HTML ブロックは空行まで続くため、空行で区切る
    const content = ['<div>確認する</div>', '', '  <br/>', '', '<!-- メモ -->', '<https://example.com> を見る'].join('\n')
    const result = insertLineTaskMarkers(content, [0, 2, 4, 5].map(lineIndex => ({ lineIndex })))
    expect(result.placed).toEqual([false, false, false, true])
  })

  test('複数行の HTML ブロックとコメントの内側にも差し込まず、空行・閉じたあとは差し込む', () => {
    const content = ['<div>', '確認する', '</div>', '', '後', '<!--', 'メモ', '-->', '最後'].join('\n')
    const result = insertLineTaskMarkers(content, [1, 4, 6, 8].map(lineIndex => ({ lineIndex })))
    expect(result.placed).toEqual([false, true, false, true])
  })

  test('多数の行がタスクでも、すべて描画される行なら一括で差し込む', () => {
    const content = Array.from({ length: 50 }, (_, i) => `- 項目${i}`).join('\n')
    const result = insertLineTaskMarkers(content, Array.from({ length: 50 }, (_, lineIndex) => ({ lineIndex })))
    expect(result.placed.every(Boolean)).toBe(true)
  })

  test('引用の中のコードフェンスの内側には差し込まない', () => {
    const content = ['> ```', '> 確認する', '> ```', '> 引用の本文'].join('\n')
    const result = insertLineTaskMarkers(content, [1, 3].map(lineIndex => ({ lineIndex })))
    expect(result.placed).toEqual([false, true])
  })

  test('コードフェンスの行と内側には差し込まない', () => {
    const result = insertLineTaskMarkers('前\n```ts\nconst a = 1\n```\n後', [0, 1, 2, 3, 4].map(lineIndex => ({ lineIndex })))
    expect(result.placed).toEqual([true, false, false, false, true])
  })

  test('引用・リスト内の生 HTML には差し込まない', () => {
    const content = ['> <div>Follow up</div>', '', '- <div>メモ</div>', '', '> 普通の引用'].join('\n')
    const result = insertLineTaskMarkers(content, [0, 2, 4].map(lineIndex => ({ lineIndex })))
    expect(result.placed).toEqual([false, false, true])
    expect(result.text).toBe(['> <div>Follow up</div>', '', '- <div>メモ</div>', '', `> 普通の引用 ${M(2)}`].join('\n'))
  })

  test('外側のパイプが無い表は区切り行・行とも差し込まず、表のまま保つ', () => {
    const content = ['name | owner', '--- | ---', 'a | b'].join('\n')
    const result = insertLineTaskMarkers(content, [0, 1, 2].map(lineIndex => ({ lineIndex })))
    expect(result.placed).toEqual([false, false, false])
    expect(result.text).toBe(content)
  })

  test('通常の段落・リスト項目・引用・見出しの行には差し込む', () => {
    const content = ['段落', '', '- 項目', '1. 番号', '> 引用', '', '## 見出し'].join('\n')
    const result = insertLineTaskMarkers(content, [0, 2, 3, 4, 6].map(lineIndex => ({ lineIndex })))
    expect(result.placed).toEqual([true, true, true, true, true])
  })

  test('本文に紛れた目印用の文字は取り除く', () => {
    const result = insertLineTaskMarkers(`偽装${M(9)}\n本物`, [{ lineIndex: 1 }])
    expect(result.text).toBe(`偽装9\n本物 ${M(0)}`)
    expect(stripLineTaskMarkers(`a${M(1)}b`)).toBe('a1b')
  })
})

describe('removeLineTaskMarkers', () => {
  test('区切りの空白ごと目印を取り除く', () => {
    expect(removeLineTaskMarkers(`code ${M(0)}\nnext`)).toBe('code\nnext')
  })
})

describe('splitLineTaskMarkers', () => {
  test('目印が無ければ元の文字列1つを返す', () => {
    expect(splitLineTaskMarkers('plain')).toEqual(['plain'])
  })

  test('文字列と目印に分ける', () => {
    expect(splitLineTaskMarkers(`あ${M(0)}い${M(12)}`)).toEqual(['あ', { taskIndex: 0 }, 'い', { taskIndex: 12 }])
  })
})
