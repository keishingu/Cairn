// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { COMMANDS } from './commands'

describe('数字ナビゲーション', () => {
  test('チャットを先頭にしてサイドメニューの表示順と数字を揃える', () => {
    const navigationCommands = COMMANDS.filter(command => command.id.startsWith('nav.'))

    expect(navigationCommands.map(command => ({
      id: command.id,
      code: command.key?.code,
    }))).toEqual([
      { id: 'nav.chats', code: 'Digit1' },
      { id: 'nav.projects', code: 'Digit2' },
      { id: 'nav.calendar', code: 'Digit3' },
      { id: 'nav.kanban', code: 'Digit4' },
      { id: 'nav.tasks', code: 'Digit5' },
      { id: 'nav.files', code: 'Digit6' },
      { id: 'nav.gallery', code: 'Digit7' },
      { id: 'nav.ai', code: 'Digit8' },
      { id: 'nav.members', code: 'Digit9' },
      { id: 'nav.settings', code: 'Comma' },
    ])
  })
})
