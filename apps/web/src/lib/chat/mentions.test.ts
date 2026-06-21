// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest'
import {
  extractMentionIds,
  canonicalizeMentions,
  hydrateMentions,
  stripMentionsToText,
  UNKNOWN_MENTION_NAME,
} from './mentions'

const names: Record<string, string> = { u1: '田中', u2: 'John Doe' }
const nameOf = (id: string) => names[id]

describe('extractMentionIds', () => {
  it('canonical 形式と旧形式の両方から userId を抽出する', () => {
    expect(extractMentionIds('やあ <@u1> と <@u2|古い名前> へ')).toEqual(['u1', 'u2'])
  })

  it('同じ userId は重複排除する', () => {
    expect(extractMentionIds('<@u1> <@u1>')).toEqual(['u1'])
  })

  it('メンションが無ければ空配列', () => {
    expect(extractMentionIds('ただのテキスト')).toEqual([])
  })
})

describe('canonicalizeMentions', () => {
  it('旧形式の埋め込み名を除去して canonical 形式にする', () => {
    expect(canonicalizeMentions('<@u1|田中> こんにちは')).toBe('<@u1> こんにちは')
  })

  it('canonical 形式はそのまま保つ', () => {
    expect(canonicalizeMentions('<@u1> やあ')).toBe('<@u1> やあ')
  })
})

describe('hydrateMentions', () => {
  it('canonical 形式に現在の表示名を埋め込む', () => {
    expect(hydrateMentions('<@u1> さん', nameOf)).toBe('<@u1|田中> さん')
  })

  it('旧形式の埋め込み名より現在名を優先する（名前変更を反映）', () => {
    expect(hydrateMentions('<@u1|古い名前> さん', nameOf)).toBe('<@u1|田中> さん')
  })

  it('解決できない userId はフォールバック名で埋める', () => {
    expect(hydrateMentions('<@unknown> さん', nameOf)).toBe(`<@unknown|${UNKNOWN_MENTION_NAME}> さん`)
  })
})

describe('stripMentionsToText', () => {
  it('最新名で @表示名 に変換する', () => {
    expect(stripMentionsToText('<@u2|古い> やあ', nameOf)).toBe('@John Doe やあ')
  })

  it('nameOf 未指定なら旧形式の埋め込み名を使う', () => {
    expect(stripMentionsToText('<@u1|田中> やあ')).toBe('@田中 やあ')
  })
})
