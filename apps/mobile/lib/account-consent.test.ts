// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { translate } from '@cairn/shared'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_CONSENT_MESSAGE, accountConsentPieces } from './account-consent'

describe('アカウント作成の同意文', () => {
  it.each([
    [
      'en' as const,
      [
        { kind: 'text', text: 'By creating an account, you agree to the ' },
        { kind: 'link', slot: 'terms' },
        { kind: 'text', text: ' and ' },
        { kind: 'link', slot: 'privacy' },
        { kind: 'text', text: '.' },
      ],
    ],
    [
      'ja' as const,
      [
        { kind: 'text', text: 'アカウントを作成することで、' },
        { kind: 'link', slot: 'terms' },
        { kind: 'text', text: 'と' },
        { kind: 'link', slot: 'privacy' },
        { kind: 'text', text: 'に同意したものとみなします。' },
      ],
    ],
  ])('%s では規約とプライバシーポリシーを文の中に置く', (locale, pieces) => {
    expect(accountConsentPieces(translate(locale, ACCOUNT_CONSENT_MESSAGE))).toEqual(pieces)
  })
})
