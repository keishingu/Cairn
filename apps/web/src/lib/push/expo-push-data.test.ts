// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { expoPushData } from './expo-push-data'

describe('Expo Push の data', () => {
  it('遷移先とワークスペースだけを載せる', () => {
    expect(expoPushData({ url: '/chats/ch-1', workspaceId: 'ws-1' })).toEqual({
      url: '/chats/ch-1',
      workspaceId: 'ws-1',
    })
  })

  it('空の値は載せない', () => {
    expect(expoPushData({})).toBeUndefined()
    expect(expoPushData({ url: '', workspaceId: '' })).toBeUndefined()
    expect(expoPushData({ url: '/tasks' })).toEqual({ url: '/tasks' })
  })
})
