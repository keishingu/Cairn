// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { instructionToPlainText, referenceTrigger } from './instruction-editor'

describe('指示文の入力補完', () => {
  test('カーソル直前の @ / # と入力中の名前を見つける', () => {
    expect(referenceTrigger('毎日 #審', 5)).toEqual({ symbol: '#', query: '審', start: 3 })
    expect(referenceTrigger('@', 1)).toEqual({ symbol: '@', query: '', start: 0 })
    expect(referenceTrigger('mail@example', 12)).toBeNull()
    expect(referenceTrigger('@鈴木 さんに', 7)).toBeNull()
  })

  test('参照を @名前 / #名前 の文字にする', () => {
    expect(
      instructionToPlainText('<@u1|鈴木> と <@role:r1|レビュワー> を <#50000000-0000-4000-8000-000000000009|審議> へ'),
    ).toBe('@鈴木 と @レビュワー を #審議 へ')
  })
})
