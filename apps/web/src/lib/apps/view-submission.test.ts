// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { pollModalFixture } from '@cairn/shared/blocks/fixtures'
import { displayableErrors, parseViewSubmissionResponse, validateSubmission } from './view-submission'

const view = JSON.parse(JSON.stringify(pollModalFixture)) as unknown

describe('モーダルの送信値の検証', () => {
  it('保存済みの入力欄と照合し、Slack と同じ state.values の形にする', () => {
    expect(validateSubmission(view, { question: { value: '11月の担当' }, options: { value: '第1週\n第2週' }, mode: { value: 'single' } })).toEqual({
      ok: true,
      values: {
        question: { value: { type: 'plain_text_input', value: '11月の担当' } },
        options: { value: { type: 'plain_text_input', value: '第1週\n第2週' } },
        mode: { value: { type: 'static_select', selected_option: { text: { type: 'plain_text', text: '1つだけ' }, value: 'single' } } },
      },
    })
  })

  it('任意の欄は空でよく、null として届ける', () => {
    const result = validateSubmission(view, { question: { value: 'q' }, options: { value: 'a' } })
    expect(result.ok && result.values['mode']).toEqual({ value: { type: 'static_select', selected_option: null } })
  })

  it('必須の空欄・上限超え・選択肢にない値を入力欄ごとのエラーにする', () => {
    expect(validateSubmission(view, { question: { value: 'あ'.repeat(201) }, mode: { value: 'forged' } })).toEqual({
      ok: false,
      errors: { question: { code: 'too_long' }, options: { code: 'required' }, mode: { code: 'invalid_option' } },
    })
  })

  it('view に無い欄の値は届けない', () => {
    const result = validateSubmission(view, { question: { value: 'q' }, options: { value: 'a' }, injected: { value: 'x' } })
    expect(result.ok && Object.keys(result.values)).toEqual(['question', 'options', 'mode'])
  })
})

describe('view_submission へのアプリの応答', () => {
  it('空の 200 と clear は閉じる', () => {
    expect(parseViewSubmissionResponse('')).toEqual({ action: 'close' })
    expect(parseViewSubmissionResponse('{"response_action":"clear"}')).toEqual({ action: 'close' })
  })

  it('errors はアプリが返した文言を入力欄ごとに持つ', () => {
    expect(parseViewSubmissionResponse('{"response_action":"errors","errors":{"options":"2つ以上入力してください","bad":1}}')).toEqual({
      action: 'errors',
      errors: { options: { message: '2つ以上入力してください' } },
    })
  })

  it('update と push は差し替えとして扱う', () => {
    expect(parseViewSubmissionResponse('{"response_action":"update","view":{"type":"modal"}}')).toEqual({ action: 'update', view: { type: 'modal' } })
    expect(parseViewSubmissionResponse('{"response_action":"push","view":{"type":"modal"}}')).toEqual({ action: 'update', view: { type: 'modal' } })
  })
})

describe('アプリが返した errors の表示', () => {
  it('今の view の入力欄に出せるものだけを残し、1つも出せなければ null にする', () => {
    expect(displayableErrors(pollModalFixture, { question: { message: '長すぎます' }, unknown: { message: 'x' } })).toEqual({ question: { message: '長すぎます' } })
    expect(displayableErrors(pollModalFixture, { unknown: { message: 'x' } })).toBeNull()
    expect(displayableErrors(pollModalFixture, {})).toBeNull()
  })
})
