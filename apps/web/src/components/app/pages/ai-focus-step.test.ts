// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { nextAiFocusStep } from './ai-focus-step'

const empty = { id: 'empty', title: null }
const used = { id: 'used', title: '質問' }

describe('入力欄へのフォーカス要求の次の手順', () => {
  it('会話の一覧を取得するまで待つ', () => {
    expect(nextAiFocusStep({ conversations: undefined, activeId: null, activeMessages: undefined })).toEqual({ kind: 'wait' })
  })

  it('会話が 1 件も無ければ新しく作る', () => {
    expect(nextAiFocusStep({ conversations: [], activeId: null, activeMessages: undefined })).toEqual({ kind: 'create' })
  })

  it('直近の会話にやり取りがあれば新しく作る', () => {
    expect(nextAiFocusStep({ conversations: [used, empty], activeId: null, activeMessages: undefined })).toEqual({ kind: 'create' })
  })

  it('直近の会話がタイトルなしなら開いて中身を確かめる', () => {
    expect(nextAiFocusStep({ conversations: [empty, used], activeId: 'used', activeMessages: [{}] })).toEqual({ kind: 'open', conversationId: 'empty' })
  })

  it('中身を取得するまで待つ', () => {
    expect(nextAiFocusStep({ conversations: [empty], activeId: 'empty', activeMessages: undefined })).toEqual({ kind: 'wait' })
  })

  it('直近の会話が空なら使い回してフォーカスする', () => {
    expect(nextAiFocusStep({ conversations: [empty], activeId: 'empty', activeMessages: [] })).toEqual({ kind: 'focus', conversationId: 'empty' })
  })

  it('タイトルなしでも中身があれば新しく作る', () => {
    expect(nextAiFocusStep({ conversations: [empty], activeId: 'empty', activeMessages: [{}] })).toEqual({ kind: 'create' })
  })
})
