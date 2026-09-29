// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { workspaceChannelDeleteCopy, workspaceChannelDisplayName } from './workspace-channel-copy'

describe('プロジェクトに紐づかないチャットの削除確認', () => {
  it('名称が空のときは種別が分かる代替名を使う', () => {
    expect(workspaceChannelDisplayName('  ', false)).toBe('名称未設定チャンネル')
    expect(workspaceChannelDisplayName(null, true)).toBe('名称未設定スレッド')
  })

  it('チャンネル削除では配下スレッドの有無で消える範囲を分ける', () => {
    expect(workspaceChannelDeleteCopy({ name: '雑談', isThread: false, childThreadCount: 0 })).toEqual({
      title: 'チャンネルを削除',
      message: '「雑談」を削除します。メッセージとタスクも一緒に削除され、元に戻せません。',
    })
    expect(workspaceChannelDeleteCopy({ name: '雑談', isThread: false, childThreadCount: 2 }).message).toContain('配下のスレッド')
  })

  it('スレッド削除では対象がスレッドだと分かる', () => {
    expect(workspaceChannelDeleteCopy({ name: 'リリース準備', isThread: true, childThreadCount: 0 })).toEqual({
      title: 'スレッドを削除',
      message: 'スレッド「リリース準備」を削除します。メッセージとタスクも一緒に削除され、元に戻せません。',
    })
  })
})
