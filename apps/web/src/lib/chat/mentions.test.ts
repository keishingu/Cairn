// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest'
import {
  ALL_MENTION_ID,
  PROJECT_MEMBERS_MENTION_ID,
  UNKNOWN_ATTRIBUTE_NAME,
  UNKNOWN_MENTION_NAME,
  attributeMentionTokenId,
  extractAttributeMentionIds,
  extractMentionIds,
  hasAllMention,
  hasGroupMention,
  hasProjectMembersMention,
  canonicalizeMentions,
  hydrateMentions,
  stripMentionsToText,
} from './mentions'

const names: Record<string, string> = {
  u1: '田中',
  u2: 'John Doe',
  [attributeMentionTokenId('attr-1')]: 'コーチ',
}
const nameOf = (id: string) => names[id]

describe('extractMentionIds', () => {
  it('canonical 形式と旧形式の両方から userId を抽出する', () => {
    expect(extractMentionIds('やあ <@u1> と <@u2|古い名前> へ')).toEqual(['u1', 'u2'])
  })

  it('同じ userId は重複排除する', () => {
    expect(extractMentionIds('<@u1> <@u1>')).toEqual(['u1'])
  })

  it('@all / @project_members / 属性トークンは userId として抽出しない', () => {
    expect(
      extractMentionIds(`<@${ALL_MENTION_ID}> <@${PROJECT_MEMBERS_MENTION_ID}> <@attr:attr-1> <@u1>`),
    ).toEqual(['u1'])
  })

  it('メンションが無ければ空配列', () => {
    expect(extractMentionIds('ただのテキスト')).toEqual([])
  })
})

describe('グループメンション抽出', () => {
  it('属性メンションの attributeId を抽出する', () => {
    expect(extractAttributeMentionIds('<@attr:a1> と <@attr:a2|コーチ> <@attr:a1>')).toEqual(['a1', 'a2'])
  })

  it('@all / @project_members の有無を判定する', () => {
    expect(hasAllMention('<@all> 確認')).toBe(true)
    expect(hasProjectMembersMention('<@project_members> 確認')).toBe(true)
    expect(hasGroupMention('<@u1>')).toBe(false)
    expect(hasGroupMention('<@attr:a1>')).toBe(true)
  })
})

describe('canonicalizeMentions', () => {
  it('旧形式の埋め込み名を除去して canonical 形式にする', () => {
    expect(canonicalizeMentions('<@u1|田中> <@all|all> <@attr:a1|コーチ>')).toBe(
      '<@u1> <@all> <@attr:a1>',
    )
  })
})

describe('hydrateMentions', () => {
  it('canonical 形式に現在の表示名を埋め込む', () => {
    expect(hydrateMentions('<@u1> さん', nameOf)).toBe('<@u1|田中> さん')
  })

  it('@all / @project_members / 属性も解決する', () => {
    expect(
      hydrateMentions(
        `<@${ALL_MENTION_ID}> <@${PROJECT_MEMBERS_MENTION_ID}> <@attr:attr-1>`,
        nameOf,
      ),
    ).toBe('<@all|all> <@project_members|project_members> <@attr:attr-1|コーチ>')
  })

  it('解決できない userId / 属性はフォールバック名で埋める', () => {
    expect(hydrateMentions('<@unknown> <@attr:missing>', nameOf)).toBe(
      `<@unknown|${UNKNOWN_MENTION_NAME}> <@attr:missing|${UNKNOWN_ATTRIBUTE_NAME}>`,
    )
  })
})

describe('stripMentionsToText', () => {
  it('最新名で @表示名 に変換する', () => {
    expect(stripMentionsToText('<@u2|古い> <@all> <@attr:attr-1>', nameOf)).toBe(
      '@John Doe @all @コーチ',
    )
  })
})
