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

/** markdown ブロック・meter の受理を有効にした状態（FEATURE_FLAGS.cardMarkdownAndMeter を true にした後）で受理する */
const accept = (input: unknown) => prepareMessageBlocks(input, { acceptMarkdownAndMeter: true })

function acceptErrorsOf(input: unknown): string[] {
  const result = accept(input)
  return result.ok ? [] : result.errors
}

describe('メッセージの blocks の受理', () => {
  it('投票カードと全要素入りのカードを受理する', () => {
    expect(prepareMessageBlocks(clone(pollCardFixture)).ok).toBe(true)
    expect(accept(clone(allElementsFixture)).ok).toBe(true)
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

  it('markdown ブロックと meter は、受理を有効にするまで未対応として断る（描画を先に、受理を後に）', () => {
    const blocks = [{ type: 'markdown', text: '**太字**' }, { type: 'context', elements: [{ type: 'meter', value: 1, max: 2 }] }]
    expect(errorsOf(clone(blocks))).toEqual([
      '[ERROR] 未対応のブロック種別です: markdown [json-pointer:/blocks/0/type]',
      '[ERROR] 未対応の要素です: meter [json-pointer:/blocks/1/elements/0/type]',
    ])
    expect(accept(clone(blocks)).ok).toBe(true)
  })

  it('markdown ブロックの文字数はメッセージ内の合計で上限をかける', () => {
    expect(accept([{ type: 'markdown', text: 'a'.repeat(6000) }, { type: 'markdown', text: 'b'.repeat(6000) }]).ok).toBe(true)
    expect(acceptErrorsOf([{ type: 'markdown', text: 'a'.repeat(6000) }, { type: 'markdown', text: 'b'.repeat(6001) }])).toEqual([
      '[ERROR] markdown ブロックの文字数はメッセージ内の合計で 12000 文字までです [json-pointer:/blocks/1/text]',
    ])
  })

  it('モーダルの meter も、受理を有効にするまで未対応として断る', () => {
    const view = { ...clone(pollModalFixture), blocks: [...clone(pollModalFixture).blocks, { type: 'context', elements: [{ type: 'meter', value: 1, max: 2 }] }] }
    const index = view.blocks.length - 1
    const result = prepareModalView(clone(view))
    expect(result.ok ? [] : result.errors).toEqual([`[ERROR] 未対応の要素です: meter [json-pointer:/view/blocks/${index}/elements/0/type]`])
    expect(prepareModalView(clone(view), { acceptMarkdownAndMeter: true }).ok).toBe(true)
  })

  it('markdown ブロックはモーダルでは拒否する（Slack と同じくメッセージだけ）', () => {
    const view = { ...clone(pollModalFixture), blocks: [...clone(pollModalFixture).blocks, { type: 'markdown', text: '**太字**' }] }
    expect(prepareModalView(view).ok).toBe(false)
  })

  it('meter は値が min〜max の範囲にあるときだけ受理する', () => {
    const context = (meter: Record<string, unknown>) => [{ type: 'context', elements: [{ type: 'meter', ...meter }] }]
    expect(accept(context({ value: 0, max: 5 })).ok).toBe(true)
    expect(accept(context({ value: -1, min: -2, max: 0 })).ok).toBe(true)
    expect(acceptErrorsOf(context({ value: 6, max: 5 })).length).toBeGreaterThan(0)
    expect(acceptErrorsOf(context({ value: 0, max: 0 })).length).toBeGreaterThan(0)
    expect(acceptErrorsOf(context({ value: 1, max: 5, color: 'red' })).length).toBeGreaterThan(0)
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
    expect(isHttpsUrl('https://999.999.999.999/image.png')).toBe(false)
    expect(isHttpsUrl('https://1.2.3/a')).toBe(false)
    expect(isHttpsUrl('https://010.0.0.1/a')).toBe(false)
    expect(isHttpsUrl('https://example.123/a')).toBe(false)
    expect(isHttpsUrl('https://203.0.113.10/a')).toBe(true)
    expect(isHttpsUrl('https://[::::]/a')).toBe(false)
    expect(isHttpsUrl('https://[1:2:3:4:5:6:7:8:9]/a')).toBe(false)
    expect(isHttpsUrl('https://[12345::1]/a')).toBe(false)
    expect(isHttpsUrl('https://[::1]/a')).toBe(true)
    expect(isHttpsUrl('https://[::ffff:192.0.2.1]/a')).toBe(true)
    expect(isHttpsUrl('https://[192.0.2.1::]/a')).toBe(false)
    expect(isHttpsUrl('https://[1:192.0.2.1::]/a')).toBe(false)
    expect(isHttpsUrl('https://[192.0.2.1::1]/a')).toBe(false)
    expect(isHttpsUrl('https://[1:2:3:4:5:6:7:8]/a')).toBe(true)
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
  it('__proto__ や constructor などオブジェクトの組み込みの名前は block_id・action_id に使えない', () => {
    const modal = (blockIdValue: string, actionIdValue: string) => ({
      type: 'modal',
      title: { type: 'plain_text', text: '設定' },
      submit: { type: 'plain_text', text: '保存' },
      blocks: [{ type: 'input', block_id: blockIdValue, label: { type: 'plain_text', text: '名前' }, element: { type: 'plain_text_input', action_id: actionIdValue } }],
    })
    expect(prepareModalView(modal('__proto__', 'v')).ok).toBe(false)
    expect(prepareModalView(modal('constructor', 'name')).ok).toBe(false)
    expect(prepareModalView(modal('name', 'toString')).ok).toBe(false)
    expect(prepareModalView(modal('name', 'value')).ok).toBe(true)
  })

  it('入力欄の static_select の confirm は描けないので受け付けない', () => {
    const result = prepareModalView({
      type: 'modal',
      title: { type: 'plain_text', text: '設定' },
      submit: { type: 'plain_text', text: '保存' },
      blocks: [{
        type: 'input',
        block_id: 'mode',
        label: { type: 'plain_text', text: '方式' },
        element: {
          type: 'static_select',
          action_id: 'v',
          options: [{ text: { type: 'plain_text', text: '削除' }, value: 'delete' }],
          confirm: { title: { type: 'plain_text', text: '確認' }, text: { type: 'plain_text', text: '本当に？' }, confirm: { type: 'plain_text', text: 'はい' }, deny: { type: 'plain_text', text: 'いいえ' } },
        },
      }],
    })
    expect(result.ok).toBe(false)
  })

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
