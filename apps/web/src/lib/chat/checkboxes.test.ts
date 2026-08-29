// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { parseCheckboxes, reconcileCheckboxes, replaceCheckboxLabelAt, toggleCheckboxAt } from './checkboxes'

describe('replaceCheckboxLabelAt', () => {
  it('指定インデックスの文言だけを差し替え、チェック状態は保持する', () => {
    const content = '- [ ] 買い出し\n- [x] 会場予約\n- [ ] 片付け'
    const result = replaceCheckboxLabelAt(content, 1, '会場のダブルブッキング確認')
    expect(result).toBe('- [ ] 買い出し\n- [x] 会場のダブルブッキング確認\n- [ ] 片付け')
  })

  it('先頭のチェックボックスを差し替えても他行は変えない', () => {
    const content = '- [ ] 一番目\n- [ ] 二番目'
    expect(replaceCheckboxLabelAt(content, 0, '新しいタイトル')).toBe('- [ ] 新しいタイトル\n- [ ] 二番目')
  })

  it('対象外インデックスなら何も変わらない', () => {
    const content = '- [ ] 一番目'
    expect(replaceCheckboxLabelAt(content, 5, 'x')).toBe(content)
  })

  it('差し替え後もparse・toggleが同じインデックスで機能する', () => {
    const content = '- [ ] a\n- [ ] b'
    const replaced = replaceCheckboxLabelAt(content, 1, 'B')
    expect(parseCheckboxes(replaced)[1]!.text).toBe('B')
    expect(toggleCheckboxAt(replaced, 1, true)).toBe('- [ ] a\n- [x] B')
  })
})

describe('reconcileCheckboxes', () => {
  it('先頭への挿入と並べ替えでも既存チェックボックスを内容で対応させる', () => {
    const oldBoxes = parseCheckboxes('- [ ] A\n- [x] B')
    const inserted = reconcileCheckboxes(oldBoxes, parseCheckboxes('- [ ] X\n- [ ] A\n- [x] B'))

    expect(inserted.matched.map(({ oldBox, newBox }) => [oldBox.index, newBox.index])).toEqual([
      [0, 1],
      [1, 2],
    ])
    expect(inserted.added.map(box => box.text)).toEqual(['X'])

    const insertedAndToggled = reconcileCheckboxes(
      oldBoxes,
      parseCheckboxes('- [ ] X\n- [x] A\n- [x] B'),
    )
    expect(insertedAndToggled.matched.map(({ oldBox, newBox }) => [oldBox.index, newBox.index])).toEqual([
      [1, 2],
      [0, 1],
    ])
    expect(insertedAndToggled.added.map(box => box.text)).toEqual(['X'])

    const reordered = reconcileCheckboxes(oldBoxes, parseCheckboxes('- [x] B\n- [ ] A'))
    expect(reordered.matched.map(({ oldBox, newBox }) => [oldBox.index, newBox.index])).toEqual([
      [1, 0],
      [0, 1],
    ])
  })

  it('内容変更は残った同じ位置のタスクへ対応させる', () => {
    const result = reconcileCheckboxes(
      parseCheckboxes('- [ ] before'),
      parseCheckboxes('- [x] after'),
    )

    expect(result.matched).toHaveLength(1)
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
  })
})
