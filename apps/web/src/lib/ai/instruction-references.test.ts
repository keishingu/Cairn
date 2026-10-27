// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest'

vi.mock('@cairn/db', () => ({ db: {} }))

const CHANNEL_ID = '50000000-0000-4000-8000-000000000009'

describe('指示文の参照', () => {
  test('保存前に表示用の名前を落とし、IDだけの形にそろえる', async () => {
    const { canonicalizeInstructionReferences } = await import('./instruction-references')
    expect(
      canonicalizeInstructionReferences(`<@u1|鈴木> と <@role:r1|レビュワー> と <@attr:a1|コーチ> を <#${CHANNEL_ID}|審議> へ`),
    ).toBe(`<@u1> と <@role:r1> と <@attr:a1> を <#${CHANNEL_ID}> へ`)
  })

  test('チャンネルの参照からIDを重複なく取り出す', async () => {
    const { extractChannelReferenceIds } = await import('./instruction-references')
    expect(extractChannelReferenceIds(`<#${CHANNEL_ID}> と <#${CHANNEL_ID}|審議> と #審議`)).toEqual([CHANNEL_ID])
  })
})
