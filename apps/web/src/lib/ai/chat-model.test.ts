// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { AI_CHAT_MODELS } from '@cairn/shared'
import { BILLING_CONFIG } from '@cairn/core/billing'
import { chatRequestCredits, parseWorkspaceChatModels, resolveConversationModel, type WorkspaceChatModels } from './chat-model'

const models: WorkspaceChatModels = { defaultModel: 'gpt-5', allowedModels: ['gpt-5', 'claude-sonnet-5-5'] }

describe('モデル別のクレジット', () => {
  test('課金設定のモデルは、選べるモデルの集合と一致する', () => {
    expect(Object.keys(BILLING_CONFIG.aiChatRequestCreditsByModel).sort()).toEqual([...AI_CHAT_MODELS].sort())
  })

  test('Opus は他のモデルより多く消費する', () => {
    expect(chatRequestCredits('claude-opus-5-5')).toBeGreaterThan(chatRequestCredits('claude-sonnet-5-5'))
    expect(chatRequestCredits('gpt-5')).toBe(BILLING_CONFIG.activeAiRequestCredits)
  })
})

describe('parseWorkspaceChatModels', () => {
  test('不正な値は既定へ置き換えずエラーにする', () => {
    expect(() => parseWorkspaceChatModels({ aiChatModel: 'gpt-4o', aiChatAllowedModels: ['gpt-5'] })).toThrow()
    expect(() => parseWorkspaceChatModels({ aiChatModel: 'gpt-5', aiChatAllowedModels: ['gpt-5', 'x'] })).toThrow()
    expect(() => parseWorkspaceChatModels({ aiChatModel: 'gpt-5', aiChatAllowedModels: [] })).toThrow()
  })
})

describe('resolveConversationModel', () => {
  test('モデルを持たない旧い会話は、ワークスペースの既定モデルを使う', () => {
    expect(resolveConversationModel(null, models)).toBe('gpt-5')
  })

  test('会話で選んだモデルは、そのまま使う', () => {
    expect(resolveConversationModel('claude-sonnet-5-5', models)).toBe('claude-sonnet-5-5')
  })

  test('不正な値はエラーにする', () => {
    expect(() => resolveConversationModel('claude-3', models)).toThrow()
  })
})
