// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { pollCardFixture } from '@cairn/shared/blocks/fixtures'
import { blocksForClient, cardRevision } from './blocks-for-client'

describe('クライアントへ返す blocks', () => {
  it('ボタンの value を落とし、それ以外の構造は保つ', () => {
    const result = blocksForClient([
      {
        type: 'section',
        text: { type: 'plain_text', text: '第1週' },
        accessory: { type: 'button', action_id: 'vote', text: { type: 'plain_text', text: '投票' }, value: 'option:1' },
      },
    ])
    expect(result).toEqual([
      {
        type: 'section',
        text: { type: 'plain_text', text: '第1週' },
        accessory: { type: 'button', action_id: 'vote', text: { type: 'plain_text', text: '投票' } },
      },
    ])
  })

  it('static_select の選択肢の value は残す（選んだ選択肢を送り返すため）', () => {
    const select = { type: 'static_select', action_id: 's', options: [{ text: { type: 'plain_text', text: 'A' }, value: 'a' }] }
    expect(blocksForClient([{ type: 'actions', elements: [select] }])).toEqual([{ type: 'actions', elements: [select] }])
  })

  it('投票カードからボタンの value がすべて消える', () => {
    expect(JSON.stringify(blocksForClient(pollCardFixture))).not.toContain('option:')
  })

  it('配列でない保存値は null にする', () => {
    expect(blocksForClient(null)).toBeNull()
    expect(blocksForClient({ broken: true })).toBeNull()
  })
})

describe('カードの版', () => {
  const card = (value: string) => [{ type: 'actions', block_id: 'b', elements: [{ type: 'button', action_id: 'a', text: { type: 'plain_text', text: '押す' }, value }] }]

  it('クライアントへ返さないボタンの value が変わっても版は変わり、value そのものは含めない', () => {
    const before = cardRevision(card('v1'), 'm1')
    expect(cardRevision(card('v2'), 'm1')).not.toBe(before)
    expect(cardRevision(card('v1'), 'm1')).toBe(before)
    expect(before).not.toContain('v1')
  })

  it('同じ中身でもメッセージが違えば別の版にする', () => {
    expect(cardRevision(card('v1'), 'm1')).not.toBe(cardRevision(card('v1'), 'm2'))
  })
})
