// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { chatProjectRoleLabel, projectRoleLabel } from './project-role-display'

describe('プロジェクト役割の表示名', () => {
  it('設定名があればメンバー詳細は旧ラベルではなく設定名を使う', () => {
    expect(projectRoleLabel({
      legacyRole: 'member',
      roleName: 'デザイナー',
      configuredLegacyRole: null,
    })).toBe('デザイナー')
    expect(projectRoleLabel({
      legacyRole: 'leader',
      roleName: '主宰',
      configuredLegacyRole: 'leader',
    })).toBe('主宰')
  })

  it('役割メタデータが無いときは旧 enum のラベルに戻す', () => {
    expect(projectRoleLabel({ legacyRole: 'subleader', roleName: null })).toBe('サブリーダー')
  })

  it('チャットはカスタム役割と改名した組み込み役割を出し、初期のメンバーは隠す', () => {
    expect(chatProjectRoleLabel({
      legacyRole: 'member',
      roleName: 'デザイナー',
      configuredLegacyRole: null,
    })).toBe('デザイナー')
    expect(chatProjectRoleLabel({
      legacyRole: 'leader',
      roleName: '主宰',
      configuredLegacyRole: 'leader',
    })).toBe('主宰')
    expect(chatProjectRoleLabel({
      legacyRole: 'member',
      roleName: '参加者',
      configuredLegacyRole: 'member',
    })).toBe('参加者')
    expect(chatProjectRoleLabel({
      legacyRole: 'member',
      roleName: 'メンバー',
      configuredLegacyRole: 'member',
    })).toBeNull()
    expect(chatProjectRoleLabel({ legacyRole: 'subleader' })).toBe('サブリーダー')
    expect(chatProjectRoleLabel({ legacyRole: 'member' })).toBeNull()
  })
})