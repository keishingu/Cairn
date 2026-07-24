// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { resolveUploadRights, resolveWorkspaceState } from './billing'

describe('resolveWorkspaceState', () => {
  it('課金が無効なセルフホストでは残高にかかわらず無制限にする', () => {
    expect(resolveWorkspaceState(-10, false)).toBe('unlimited')
  })

  it('正の残高がある課金ワークスペースを funded にする', () => {
    expect(resolveWorkspaceState(1, true)).toBe('funded')
  })

  it.each([0, -1])('残高 %i の課金ワークスペースを weathered にする', (creditBalance) => {
    expect(resolveWorkspaceState(creditBalance, true)).toBe('weathered')
  })
})

describe('resolveUploadRights', () => {
  it('セルフホストでは支援状態にかかわらず原本・大容量・動画を許可する', () => {
    expect(resolveUploadRights(false, false, false)).toEqual({
      canUploadOriginal: true,
      canUploadLargeFile: true,
      canUploadVideo: true,
    })
  })

  it('funded のアクティブ支援者にだけ原本・大容量・動画を許可する', () => {
    expect(resolveUploadRights(true, true, true)).toEqual({
      canUploadOriginal: true,
      canUploadLargeFile: true,
      canUploadVideo: true,
    })
  })

  it.each([
    [false, true],
    [true, false],
  ] as const)(
    '権利または残高を満たさない場合は有料ストレージを許可しない',
    (isActiveSupporter, workspaceFunded) => {
      expect(resolveUploadRights(isActiveSupporter, workspaceFunded, true)).toEqual({
        canUploadOriginal: false,
        canUploadLargeFile: false,
        canUploadVideo: false,
      })
    },
  )
})
