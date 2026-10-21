// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { normalizeMessageBlocks, prepareMessageBlocks, prepareModalView } from '@cairn/shared'
import { createPollModal, onlyCreatorCanCloseModal, parsePollSubmission, renderPollCard, type PollForRender } from './render'

type Block = { type: string; text?: { type: string; text: string }; accessory?: unknown; elements?: Array<{ text: string }> }

const poll: PollForRender = {
  id: 'p1',
  question: '11月の登山本部 担当決め',
  allowMultiple: false,
  status: 'posted',
  options: [
    { id: 'o2', label: '第2週 (11/9〜)', position: 1 },
    { id: 'o1', label: '第1週 (11/2〜)', position: 0 },
  ],
  votes: [
    { optionId: 'o1', userId: 'u1' },
    { optionId: 'o1', userId: 'u2' },
  ],
}

describe('投票カード', () => {
  it('Cairn の受理判定を通る blocks を作る', () => {
    const card = renderPollCard(poll)
    expect(prepareMessageBlocks(card.blocks).ok).toBe(true)
    expect(normalizeMessageBlocks(card.blocks).hasUnsupported).toBe(false)
    expect(card.text).toBe('投票: 11月の登山本部 担当決め')
  })

  it('選択肢を並び順に出し、票数・バー・投票者のメンションを付ける', () => {
    const blocks = renderPollCard(poll).blocks as Block[]
    expect(blocks[2]).toMatchObject({ type: 'section', text: { type: 'plain_text', text: '第1週 (11/2〜)' }, accessory: { action_id: 'vote', value: 'option:o1' } })
    expect(blocks[3]!.elements?.[0]?.text).toBe('`▓▓▓▓▓▓▓▓▓▓` 2票 ・ <@u1> <@u2>')
    expect(blocks[5]!.elements?.[0]?.text).toBe('`░░░░░░░░░░` 0票')
    expect(blocks[1]!.elements?.[0]?.text).toBe('単一選択 ・ 2人が投票')
  })

  it('選択肢や質問の書式記号を mrkdwn として解釈させない（plain_text で出す）', () => {
    const blocks = renderPollCard({ ...poll, options: [{ id: 'x', label: '*太字* <@all>', position: 0 }] }).blocks as Block[]
    expect(blocks[2]!.text).toEqual({ type: 'plain_text', text: '*太字* <@all>' })
  })

  it('締め切ったら投票・取り消し・締切のボタンを外し、締め切り済みと出す', () => {
    const card = renderPollCard({ ...poll, status: 'closed' })
    const json = JSON.stringify(card.blocks)
    expect(json).not.toContain('"button"')
    expect(json).toContain('締め切り済み')
    expect(prepareMessageBlocks(card.blocks).ok).toBe(true)
  })

  it('選択肢10個・投票者が多くても上限内に収める', () => {
    const many: PollForRender = {
      ...poll,
      allowMultiple: true,
      options: Array.from({ length: 10 }, (_, i) => ({ id: `o${i}`, label: `選択肢${i}`, position: i })),
      votes: Array.from({ length: 200 }, (_, i) => ({ optionId: 'o0', userId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` })),
    }
    const card = renderPollCard(many)
    expect(prepareMessageBlocks(card.blocks).ok).toBe(true)
    expect(JSON.stringify(card.blocks)).toContain('ほか170人')
  })
})

describe('投票作成のモーダル', () => {
  it('Cairn の受理判定を通るモーダルを作る', () => {
    expect(prepareModalView(createPollModal('c1')).ok).toBe(true)
    expect(prepareModalView(onlyCreatorCanCloseModal()).ok).toBe(true)
  })

  it('送信値から質問・選択肢（空行と重複を除く）・選び方を取り出す', () => {
    expect(
      parsePollSubmission({
        question: { value: { value: '  11月  ' } },
        options: { value: { value: '第1週\n\n第2週\n第1週\n' } },
        mode: { value: { selected_option: { value: 'multiple' } } },
      }),
    ).toEqual({ ok: true, question: '11月', options: ['第1週', '第2週'], allowMultiple: true })
  })

  it('質問が空・選択肢が足りない・多すぎるときは入力欄ごとのエラーにする', () => {
    expect(parsePollSubmission({ question: { value: { value: '' } }, options: { value: { value: '1つだけ' } } })).toEqual({
      ok: false,
      errors: { question: '質問を入力してください', options: '選択肢を2つ以上入力してください（重複は1つにまとめます）' },
    })
    const eleven = Array.from({ length: 11 }, (_, i) => `案${i}`).join('\n')
    expect(parsePollSubmission({ question: { value: { value: 'q' } }, options: { value: { value: eleven } } })).toMatchObject({ ok: false, errors: { options: '選択肢は10個までです' } })
  })
})

describe('投票を作る前の確認', () => {
  it('質問・選択肢の数や長さ・重複・安全フィルタを、作る前に欄ごとの理由にする', async () => {
    const { pollInputErrors } = await import('./validate')
    expect(pollInputErrors('いつにする？', ['土曜', '日曜'])).toBeNull()
    expect(pollInputErrors('', ['土曜', '日曜'])).toMatchObject({ question: expect.any(String) })
    expect(pollInputErrors('いつ？', ['土曜'])).toMatchObject({ options: expect.any(String) })
    expect(pollInputErrors('いつ？', ['土曜', '土曜'])).toMatchObject({ options: '選択肢が重複しています' })
    expect(pollInputErrors('副業で月10万円保証、DMください', ['はい', 'いいえ'])).toMatchObject({ question: expect.any(String) })
  })
})
