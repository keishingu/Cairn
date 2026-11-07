// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { importedMessageId, uuidV5 } from './ids'

describe('uuidV5', () => {
  test('RFC 4122 の検証用の値と一致する', () => {
    // DNS 名前空間で "www.example.com" を v5 にした既知の値
    expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2')
  })
})

describe('importedMessageId', () => {
  test('同じワークスペース・会話・メッセージなら何度でも同じ ID になる', () => {
    expect(importedMessageId('ws', 'teams-consumer', 'c1', '1')).toBe(importedMessageId('ws', 'teams-consumer', 'c1', '1'))
  })

  test('会話が違えば同じメッセージ ID でも別の ID になる（メッセージ ID は会話内でしか一意と限らない）', () => {
    expect(importedMessageId('ws', 'teams-consumer', 'c1', '1')).not.toBe(importedMessageId('ws', 'teams-consumer', 'c2', '1'))
  })

  test('ワークスペースが違えば別の ID になり、他のワークスペースの取り込みと衝突しない', () => {
    expect(importedMessageId('ws-a', 'teams-consumer', 'c1', '1')).not.toBe(importedMessageId('ws-b', 'teams-consumer', 'c1', '1'))
  })
})
