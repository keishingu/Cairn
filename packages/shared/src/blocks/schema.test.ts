// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { allElementsFixture, pollCardFixture, pollModalFixture, unsupportedFixture } from './fixtures'
import { isHttpsUrl, prepareMessageBlocks, prepareModalView } from './schema'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function errorsOf(input: unknown): string[] {
  const result = prepareMessageBlocks(input)
  return result.ok ? [] : result.errors
}

describe('メッセージの blocks の受理', () => {
  it('投票カードと全要素入りのカードを受理する', () => {
    expect(prepareMessageBlocks(clone(pollCardFixture)).ok).toBe(true)
    expect(prepareMessageBlocks(clone(allElementsFixture)).ok).toBe(true)
  })

  it('未対応のブロック種別を理由と位置つきで拒否する', () => {
    expect(errorsOf([{ type: 'rich_text', elements: [] }])).toEqual([
      '[ERROR] 未対応のブロック種別です: rich_text [json-pointer:/blocks/0/type]',
    ])
  })

  it('未対応の要素・未知のフィールドを拒否する', () => {
    expect(errorsOf(clone(unsupportedFixture)).length).toBeGreaterThan(0)
    expect(errorsOf([{ type: 'divider', unknown_field: true }]).length).toBeGreaterThan(0)
  })

  it('モーダル専用の input はメッセージでは拒否する', () => {
    expect(errorsOf([clone(pollModalFixture.blocks[0])])).toEqual([
      '[ERROR] 未対応のブロック種別です: input [json-pointer:/blocks/0/type]',
    ])
  })

  it('空配列と上限超えを拒否する', () => {
    expect(errorsOf([]).length).toBe(1)
    expect(errorsOf(Array.from({ length: 51 }, () => ({ type: 'divider' }))).length).toBe(1)
  })

  it('section は text か fields のどちらかを必須にする', () => {
    expect(errorsOf([{ type: 'section' }])).toEqual(['[ERROR] section には text か fields が必要です [json-pointer:/blocks/0]'])
  })

  it('http の画像と userinfo 付きの URL を拒否する', () => {
    expect(errorsOf([{ type: 'image', image_url: 'http://example.com/a.png', alt_text: 'a' }])).toEqual([
      '[ERROR] https の URL を指定してください [json-pointer:/blocks/0/image_url]',
    ])
    expect(isHttpsUrl('https://example.com@evil.test/a.png')).toBe(false)
    expect(isHttpsUrl('https://example.com/a?b=c#d')).toBe(true)
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpsUrl('https://example.com:invalid/image.png')).toBe(false)
    expect(isHttpsUrl('https://example.com:99999/a')).toBe(false)
    expect(isHttpsUrl('https://-bad.example.com/a')).toBe(false)
    expect(isHttpsUrl('https://example..com/a')).toBe(false)
    expect(isHttpsUrl('https://cdn.example.com:8443/a.png')).toBe(true)
    expect(isHttpsUrl('https://xn--wgv71a.jp/')).toBe(true)
    expect(isHttpsUrl('https://[2001:db8::1]/a')).toBe(true)
  })

  it('block_id の重複と、同じブロック内の action_id の重複を拒否する', () => {
    expect(errorsOf([{ type: 'divider', block_id: 'x' }, { type: 'divider', block_id: 'x' }])).toEqual([
      '[ERROR] block_id が重複しています [json-pointer:/blocks/1/block_id]',
    ])
    const button = { type: 'button', action_id: 'a', text: { type: 'plain_text', text: 'A' } }
    expect(errorsOf([{ type: 'actions', elements: [button, button] }])).toEqual([
      '[ERROR] action_id が重複しています [json-pointer:/blocks/0/elements/1/action_id]',
    ])
  })

  it('別のブロックなら同じ action_id を許す（投票ボタンを選択肢ごとに並べるため）', () => {
    expect(prepareMessageBlocks(clone(pollCardFixture)).ok).toBe(true)
  })

  it('static_select の initial_option は options の中から選ぶ', () => {
    const select = {
      type: 'static_select',
      action_id: 's',
      options: [{ text: { type: 'plain_text', text: 'A' }, value: 'a' }],
      initial_option: { text: { type: 'plain_text', text: 'B' }, value: 'b' },
    }
    expect(errorsOf([{ type: 'actions', elements: [select] }])).toEqual([
      '[ERROR] initial_option は options のいずれかにしてください [json-pointer:/blocks/0/elements/0/initial_option]',
    ])
  })

  it('initial_option は value が同じでも表示文が違えば拒否する（宣言と違う表示で描かないため）', () => {
    const option = { text: { type: 'plain_text', text: 'A' }, value: 'a' }
    const select = (initial: unknown) => ({ type: 'actions', elements: [{ type: 'static_select', action_id: 's', options: [option], initial_option: initial }] })
    expect(errorsOf([select({ text: { type: 'plain_text', text: '別の表示' }, value: 'a' })])).toEqual([
      '[ERROR] initial_option は options のいずれかにしてください [json-pointer:/blocks/0/elements/0/initial_option]',
    ])
    expect(prepareMessageBlocks([select(option)]).ok).toBe(true)
  })

  it('省略された block_id と action_id を補う', () => {
    const result = prepareMessageBlocks([
      { type: 'divider' },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'A' } }] },
    ])
    expect(result.ok && result.value).toEqual([
      { type: 'divider', block_id: 'cairn-b0' },
      {
        type: 'actions',
        block_id: 'cairn-b1',
        elements: [{ type: 'button', action_id: 'cairn-a0', text: { type: 'plain_text', text: 'A' } }],
      },
    ])
  })

  it('補った ID が利用者の指定した ID と衝突したら拒否する', () => {
    expect(errorsOf([{ type: 'divider', block_id: 'cairn-b1' }, { type: 'divider' }])).toEqual([
      '[ERROR] block_id が重複しています [json-pointer:/blocks/1/block_id]',
    ])
  })

  it('入力の配列を書き換えない', () => {
    const input = [{ type: 'divider' }]
    prepareMessageBlocks(input)
    expect(input).toEqual([{ type: 'divider' }])
  })
})

describe('モーダルの受理', () => {
  it('投票作成のモーダルを受理する', () => {
    expect(prepareModalView(clone(pollModalFixture)).ok).toBe(true)
  })

  it('input を含むのに submit がないモーダルを拒否する', () => {
    const { submit: _submit, ...view } = clone(pollModalFixture)
    const result = prepareModalView(view)
    expect(result.ok ? [] : result.errors).toEqual(['[ERROR] input を含むモーダルには submit が必要です [json-pointer:/view/submit]'])
  })

  it('タイトルの上限（24文字）を超えたら拒否する', () => {
    const view = { ...clone(pollModalFixture), title: { type: 'plain_text', text: 'あ'.repeat(25) } }
    expect(prepareModalView(view).ok).toBe(false)
  })
})
