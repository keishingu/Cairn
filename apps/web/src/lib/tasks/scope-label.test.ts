// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { taskScopeLabel } from './scope-label'

const t = (key: string) => `T:${key}`

describe('taskScopeLabel', () => {
  it('プロジェクト名があれば最優先で返す', () => {
    expect(taskScopeLabel({ projectTitle: 'Alpha', channelName: 'general', channelType: 'workspace' }, t)).toBe('Alpha')
  })

  it('DM 由来タスクは「Direct message」を返す', () => {
    expect(taskScopeLabel({ projectTitle: null, channelName: null, channelType: 'dm' }, t)).toBe('T:Direct message')
  })

  it('通常チャンネル由来タスクはチャンネル名を返す', () => {
    expect(taskScopeLabel({ projectTitle: null, channelName: 'general', channelType: 'workspace' }, t)).toBe('general')
  })

  it('どれも無ければ「No project」を返す', () => {
    expect(taskScopeLabel({ projectTitle: null, channelName: null, channelType: null }, t)).toBe('T:No project')
  })
})
