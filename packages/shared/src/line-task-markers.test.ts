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
    const content = ['', '| a | b |', '---', '    code', '    - 入れ子', '- ok'].join('\n')
    const result = insertLineTaskMarkers(content, [0, 1, 2, 3, 4, 5].map(lineIndex => ({ lineIndex })))
    expect(result.placed).toEqual([false, false, false, false, true, true])
  })

  test('リンク参照定義の行には差し込まず、参照リンクを壊さない', () => {
    const content = ['[資料][ref] を読む', '[ref]: https://example.com', '   [b]: /path "title"'].join('\n')
    const result = insertLineTaskMarkers(content, [0, 1, 2].map(lineIndex => ({ lineIndex })))
    expect(result.placed).toEqual([true, false, false])
    expect(result.text.split('\n').slice(1)).toEqual(['[ref]: https://example.com', '   [b]: /path "title"'])
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

  test('コードフェンスの行と内側には差し込まない', () => {
    const result = insertLineTaskMarkers('前\n```ts\nconst a = 1\n```\n後', [0, 1, 2, 3, 4].map(lineIndex => ({ lineIndex })))
    expect(result.placed).toEqual([true, false, false, false, true])
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
