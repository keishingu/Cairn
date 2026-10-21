// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { MESSAGE_BLOCK_FIXTURES, allElementsFixture, nothingRenderableFixture, pollCardFixture, pollModalFixture, unsupportedFixture } from './fixtures'
import { normalizeMessageBlocks, normalizeModalView } from './normalize'

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

  it('上限を超えたブロックと要素は切り捨て、残りがあることを案内にする', () => {
    const card = normalizeMessageBlocks(Array.from({ length: 60 }, () => ({ type: 'divider' })))
    expect(card.blocks).toHaveLength(51)
    expect(card.blocks[50]).toEqual({ type: 'unsupported', original: 'truncated', blockId: 'cairn-truncated-50' })
    expect(card.hasUnsupported).toBe(true)

    const button = { type: 'button', text: { type: 'plain_text', text: 'A' } }
    const actions = normalizeMessageBlocks([{ type: 'actions', elements: Array.from({ length: 30 }, () => button) }]).blocks[0]
    expect(actions).toMatchObject({ type: 'actions' })
    expect(actions?.type === 'actions' && actions.elements).toHaveLength(26)
    expect(actions?.type === 'actions' && actions.elements[25]).toEqual({ type: 'unsupported', original: 'truncated' })
  })

  it('block_id の重複や、ブロック内の action_id の重複は、どれも unsupported にする（押下の宛先が一意に決まらないため）', () => {
    const button = (id: string) => ({ type: 'button', action_id: id, text: { type: 'plain_text', text: id } })
    const card = normalizeMessageBlocks([
      { type: 'divider', block_id: 'dup' },
      { type: 'header', block_id: 'dup', text: { type: 'plain_text', text: '見出し' } },
      { type: 'actions', block_id: 'a', elements: [button('x'), button('x'), button('y')] },
    ])
    expect(card.blocks[0]).toEqual({ type: 'unsupported', original: 'divider', blockId: 'dup' })
    expect(card.blocks[1]).toEqual({ type: 'unsupported', original: 'header', blockId: 'dup' })
    expect(card.blocks[2]).toMatchObject({
      elements: [
        { type: 'unsupported', original: 'button' },
        { type: 'unsupported', original: 'button' },
        { type: 'button', actionId: 'y' },
      ],
    })
    expect(card.hasUnsupported).toBe(true)
  })

  it('上限で切り捨てた側にある重複も数え、見えている方を unsupported にする', () => {
    const button = (id: string) => ({ type: 'button', action_id: id, text: { type: 'plain_text', text: id } })
    const elements = [button('dup'), ...Array.from({ length: 24 }, (_, i) => button(`b${i}`)), button('dup')]
    const card = normalizeMessageBlocks([
      { type: 'header', block_id: 'h', text: { type: 'plain_text', text: '見出し' } },
      { type: 'actions', block_id: 'a', elements },
      ...Array.from({ length: 48 }, (_, i) => ({ type: 'divider', block_id: `d${i}` })),
      { type: 'divider', block_id: 'h' },
    ])
    expect(card.blocks[0]).toEqual({ type: 'unsupported', original: 'header', blockId: 'h' })
    const actions = card.blocks[1]
    expect(actions?.type === 'actions' && actions.elements[0]).toEqual({ type: 'unsupported', original: 'button' })
    expect(actions?.type === 'actions' && actions.elements[1]).toMatchObject({ type: 'button', actionId: 'b0' })
  })

  it('actions / context の空や長すぎる block_id はブロックごと unsupported にする', () => {
    const elements = [{ type: 'plain_text', text: '補足' }]
    const card = normalizeMessageBlocks([
      { type: 'context', block_id: '', elements },
      { type: 'context', block_id: 'x'.repeat(256), elements },
    ])
    expect(card.blocks.map((block) => block.type)).toEqual(['unsupported', 'unsupported'])
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

describe('モーダルの正規化', () => {
  it('投票作成のモーダルを、入力欄つきの描画用の形にする', () => {
    const modal = normalizeModalView(pollModalFixture)
    expect(modal).toMatchObject({ title: '投票を作成', submit: '作成', close: 'キャンセル', hasUnsupported: false })
    expect(modal?.blocks[0]).toEqual({
      type: 'input',
      blockId: 'question',
      label: '質問',
      optional: false,
      element: { type: 'plain_text_input', actionId: 'value', multiline: false, maxLength: 200 },
    })
    expect(modal?.blocks[1]).toMatchObject({ hint: '2〜10個', element: { multiline: true } })
    expect(modal?.blocks[2]).toMatchObject({ optional: true, element: { type: 'static_select', options: [{ value: 'single' }, { value: 'multiple' }] } })
  })

  it('知らない入力欄は unsupported にし、送信を止められるよう hasUnsupported にする', () => {
    const modal = normalizeModalView({
      type: 'modal',
      title: { type: 'plain_text', text: '日程' },
      submit: { type: 'plain_text', text: '送信' },
      blocks: [{ type: 'input', block_id: 'd', label: { type: 'plain_text', text: '日付' }, element: { type: 'datepicker', action_id: 'v' } }],
    })
    expect(modal?.blocks[0]).toEqual({ type: 'unsupported', original: 'input', blockId: 'd' })
    expect(modal?.hasUnsupported).toBe(true)
  })

  it('タイトルが読めない壊れた保存値は null にする', () => {
    expect(normalizeModalView({ type: 'modal', blocks: [] })).toBeNull()
    expect(normalizeModalView(null)).toBeNull()
  })
})
