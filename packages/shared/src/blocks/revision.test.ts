// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { pollCardFixture } from './fixtures'
import { blocksRevision } from './revision'

describe('カードの版', () => {
  it('キーの並びが違っても同じ内容なら同じ版にする（サーバーとクライアントで一致させる）', () => {
    expect(blocksRevision([{ type: 'divider', block_id: 'a' }])).toBe(blocksRevision([{ block_id: 'a', type: 'divider' }]))
    expect(blocksRevision(JSON.parse(JSON.stringify(pollCardFixture)))).toBe(blocksRevision(pollCardFixture))
  })

  it('中身が変われば別の版にする', () => {
    expect(blocksRevision([{ type: 'divider', block_id: 'a' }])).not.toBe(blocksRevision([{ type: 'divider', block_id: 'b' }]))
    expect(blocksRevision([{ type: 'divider', block_id: 'a' }])).toMatch(/^[0-9a-f]{16}$/)
  })
})
