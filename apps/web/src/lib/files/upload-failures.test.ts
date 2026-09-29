// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { describeUploadFailures } from './upload-failures'

const file = (name: string) => new File(['x'], name)

describe('describeUploadFailures', () => {
  it('失敗したものだけを、選択順のファイル名付きで返す', () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'fulfilled', value: undefined },
      { status: 'rejected', reason: new Error('アップロードに失敗しました') },
      { status: 'rejected', reason: new Error('アップロードに失敗しました') },
    ]

    expect(describeUploadFailures([file('a.pdf'), file('b.pdf'), file('c.pdf')], results, '失敗'))
      .toEqual(['b.pdf: アップロードに失敗しました', 'c.pdf: アップロードに失敗しました'])
  })

  it('ファイル名がエラー文の一部に含まれていても省略しない', () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'rejected', reason: new Error('upload failed') },
    ]

    expect(describeUploadFailures([file('upload')], results, '失敗')).toEqual(['upload: upload failed'])
  })

  it('Error 以外で失敗したときは代わりの文言を使う', () => {
    const results: PromiseSettledResult<unknown>[] = [{ status: 'rejected', reason: 'network' }]

    expect(describeUploadFailures([file('a.pdf')], results, 'アップロードできませんでした'))
      .toEqual(['a.pdf: アップロードできませんでした'])
  })
})
