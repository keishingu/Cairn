// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { encodeInsertedMentions, encodePositionedMentions, intactMentionTokenIds, rebaseMentionInsertions } from './mention-insertions'

describe('encodeInsertedMentions', () => {
  it('同名の2人は挿入順に先頭から1件ずつ置き換える', () => {
    const insertions = [
      { tokenId: 'user-a', displayName: '小川聡' },
      { tokenId: 'user-b', displayName: '小川聡' },
    ]
    expect(encodeInsertedMentions('@小川聡 と @小川聡 に確認', insertions, ({ tokenId }) => `<@${tokenId}>`))
      .toBe('<@user-a> と <@user-b> に確認')
  })

  it('消した @表示名 や、名前の続きがある文字は置き換えない', () => {
    const insertions = [{ tokenId: 'user-a', displayName: '小川聡' }]
    expect(encodeInsertedMentions('@小川聡太 に確認', insertions, ({ tokenId }) => `<@${tokenId}>`)).toBe('@小川聡太 に確認')
  })

  it('表示名に $ を含んでも置換パターンとして解釈しない', () => {
    const insertions = [{ tokenId: 'user-a', displayName: 'a$&b' }]
    expect(encodeInsertedMentions('@a$&b さん', insertions, ({ tokenId, displayName }) => `<@${tokenId}|${displayName}>`))
      .toBe('<@user-a|a$&b> さん')
  })
})

describe('句読点の区切り', () => {
  it('@表示名 の直後が欧文・和文の句読点でも置き換える', () => {
    const insertions = [{ tokenId: 'user-a', displayName: 'Alice' }]
    const encode = (text: string) => encodeInsertedMentions(text, insertions, ({ tokenId }) => `<@${tokenId}>`)
    expect(encode('@Alice, please check')).toBe('<@user-a>, please check')
    expect(encode('Thanks @Alice.')).toBe('Thanks <@user-a>.')
    expect(encode('（@Alice）に確認')).toBe('（<@user-a>）に確認')
  })
})

describe('位置で対応づけた挿入', () => {
  const token = ({ tokenId, displayName }: { tokenId: string; displayName: string }) => `<@${tokenId}|${displayName}>`

  it('同名の A を入れて消し、B を入れ直したら B の ID で送る', () => {
    let insertions = [{ tokenId: 'user-a', displayName: '小川聡', start: 0 }]
    let text = '@小川聡 '
    // A を消す
    insertions = rebaseMentionInsertions(text, '', insertions)
    text = ''
    expect(insertions).toEqual([])
    // B を入れる
    text = '@小川聡 '
    insertions = [...insertions, { tokenId: 'user-b', displayName: '小川聡', start: 0 }]
    expect(encodePositionedMentions(`${text}に確認`, insertions, token)).toBe('<@user-b|小川聡> に確認')
  })

  it('同名の2人のうち前の人だけを消すと、残った後ろの人の ID で送る', () => {
    const text = '@小川聡 と @小川聡 に確認'
    const insertions = [
      { tokenId: 'user-a', displayName: '小川聡', start: 0 },
      { tokenId: 'user-b', displayName: '小川聡', start: 7 },
    ]
    const next = text.slice(5)
    const rebased = rebaseMentionInsertions(text, next, insertions)
    expect(rebased).toEqual([{ tokenId: 'user-b', displayName: '小川聡', start: 2 }])
    expect(encodePositionedMentions(next, rebased, token)).toBe('と <@user-b|小川聡> に確認')
  })

  it('前に文字を打つと位置をずらし、名前の続きを打ったら外す', () => {
    const insertions = [{ tokenId: 'user-a', displayName: 'Alice', start: 0 }]
    expect(rebaseMentionInsertions('@Alice ', '担当は @Alice ', insertions)).toEqual([{ tokenId: 'user-a', displayName: 'Alice', start: 4 }])
    expect(rebaseMentionInsertions('@Alice', '@Alicex', insertions)).toEqual([])
    expect(intactMentionTokenIds('@Alicex', insertions)).toEqual(new Set())
  })

  it('同名の2人の前の方を選択して消すと、書き換えた位置から後ろの人を残す', () => {
    const text = '@Alice @Alice '
    const insertions = [
      { tokenId: 'user-a', displayName: 'Alice', start: 0 },
      { tokenId: 'user-b', displayName: 'Alice', start: 7 },
    ]
    // 先頭の「@Alice 」を消すと、カーソルは先頭（0）にある
    expect(rebaseMentionInsertions(text, '@Alice ', insertions, 0)).toEqual([{ tokenId: 'user-b', displayName: 'Alice', start: 0 }])
    // 後ろの「@Alice 」を消したときはカーソルが 7 にあり、前の人を残す
    expect(rebaseMentionInsertions(text, '@Alice ', insertions, 7)).toEqual([{ tokenId: 'user-a', displayName: 'Alice', start: 0 }])
  })
})

