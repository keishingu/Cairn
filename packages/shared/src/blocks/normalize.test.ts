// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { MESSAGE_BLOCK_FIXTURES, allElementsFixture, nothingRenderableFixture, pollCardFixture, unsupportedFixture } from './fixtures'
import { normalizeMessageBlocks } from './normalize'

describe('blocks の正規化', () => {
  it('対応しているカードは案内なしで描ける', () => {
    expect(normalizeMessageBlocks(pollCardFixture).hasUnsupported).toBe(false)
    expect(normalizeMessageBlocks(allElementsFixture).hasUnsupported).toBe(false)
  })

  it('投票カードを描画用の形にする', () => {
    const card = normalizeMessageBlocks(pollCardFixture)
    expect(card.blocks[0]).toEqual({ type: 'header', blockId: 'title', text: '11月の登山本部 担当決め' })
    expect(card.blocks[2]).toMatchObject({
      type: 'section',
      blockId: 'option-1',
      accessory: { type: 'button', actionId: 'vote', text: '投票' },
    })
    expect(card.blocks[6]).toMatchObject({
      type: 'actions',
      elements: [
        { type: 'button', actionId: 'clear-vote' },
        { type: 'button', actionId: 'close', style: 'danger', confirm: { title: '投票を締め切りますか？', deny: 'やめる' } },
      ],
    })
  })

  it('ボタンの value は描画用の形に含めない（押下時にサーバーが保存済み blocks から引くため）', () => {
    expect(JSON.stringify(normalizeMessageBlocks(pollCardFixture))).not.toContain('option:1')
  })

  it('知らないブロック・要素は位置を保って unsupported にし、残りは描く', () => {
    const card = normalizeMessageBlocks(unsupportedFixture)
    expect(card.hasUnsupported).toBe(true)
    expect(card.nothingRenderable).toBe(false)
    expect(card.blocks).toEqual([
      {
        type: 'section',
        blockId: 'cairn-b0',
        text: { kind: 'plain', text: '描ける本文' },
        fields: [],
        accessory: { type: 'unsupported', original: 'overflow' },
      },
      { type: 'unsupported', original: 'rich_text', blockId: 'cairn-b1' },
      {
        type: 'actions',
        blockId: 'cairn-b2',
        elements: [
          { type: 'button', actionId: 'ok', text: '描けるボタン' },
          { type: 'unsupported', original: 'datepicker' },
        ],
      },
    ])
  })

  it('既知の要素でも知らないフィールドがあれば unsupported にする（新しい版の機能を黙って落とさない）', () => {
    const card = normalizeMessageBlocks([
      { type: 'actions', elements: [{ type: 'button', action_id: 'a', text: { type: 'plain_text', text: 'A' }, new_field: 1 }] },
    ])
    expect(card.blocks[0]).toMatchObject({ elements: [{ type: 'unsupported', original: 'button' }] })
  })

  it('actions / context の枠に知らないフィールドがあれば、ブロックごと unsupported にする', () => {
    const card = normalizeMessageBlocks([
      { type: 'actions', layout: 'grid', elements: [{ type: 'button', action_id: 'a', text: { type: 'plain_text', text: 'A' } }] },
      { type: 'context', block_id: 'c', elements: [{ type: 'plain_text', text: '補足' }] },
    ])
    expect(card.blocks[0]).toEqual({ type: 'unsupported', original: 'actions', blockId: 'cairn-b0' })
    expect(card.blocks[1]).toMatchObject({ type: 'context', blockId: 'c' })
    expect(card.hasUnsupported).toBe(true)
  })

  it('要素がすべて未対応の actions / context だけなら nothingRenderable にする', () => {
    const card = normalizeMessageBlocks([
      { type: 'actions', elements: [{ type: 'datepicker', action_id: 'd' }] },
      { type: 'context', elements: [{ type: 'rich_text' }] },
    ])
    expect(card).toMatchObject({ hasUnsupported: true, nothingRenderable: true })
  })

  it('何も描けなければ nothingRenderable にする', () => {
    expect(normalizeMessageBlocks(nothingRenderableFixture)).toMatchObject({ hasUnsupported: true, nothingRenderable: true })
  })

  it('配列でない保存値は例外にせず、描けないカードとして返す', () => {
    expect(normalizeMessageBlocks({ broken: true })).toEqual({ blocks: [], hasUnsupported: true, nothingRenderable: true })
    expect(normalizeMessageBlocks(null).nothingRenderable).toBe(true)
  })

  it('全 fixture を例外なく正規化できる', () => {
    for (const fixture of Object.values(MESSAGE_BLOCK_FIXTURES)) {
      expect(() => normalizeMessageBlocks(fixture)).not.toThrow()
    }
  })
})
