// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import {
  buildFileListSearchParams,
  decodeFileListCursor,
  encodeFileListCursor,
  escapeLikePattern,
  FILE_LIST_DEFAULT_LIMIT,
  parseFileListParams,
} from './file-list-query'
import { DEFAULT_FILE_FILTER_CONDITIONS } from './saved-file-filter'

const UUID = '00000000-0000-4000-8000-000000000001'

describe('ファイル一覧のカーソル', () => {
  test('エンコードしたカーソルをマイクロ秒まで含めて復元できる', () => {
    const cursor = { createdAt: '2026-08-08T00:00:01.123456Z', id: UUID }

    expect(decodeFileListCursor(encodeFileListCursor(cursor))).toEqual(cursor)
  })

  test('壊れた値や形の違う値は null にする', () => {
    expect(decodeFileListCursor('broken')).toBeNull()
    expect(decodeFileListCursor(Buffer.from('{"createdAt":"x","id":"y"}').toString('base64url'))).toBeNull()
  })
})

describe('parseFileListParams', () => {
  test('パラメータがなければ全件対象・既定の件数にする', () => {
    expect(parseFileListParams(new URLSearchParams())).toEqual({
      ok: true,
      filters: {
        type: 'all',
        projectId: 'all',
        uploaderId: 'all',
        createdFrom: null,
        createdBefore: null,
        search: [],
      },
      cursor: null,
      limit: FILE_LIST_DEFAULT_LIMIT,
    })
  })

  test('複数の検索語を空白を除いて受け取る', () => {
    const parsed = parseFileListParams(new URLSearchParams('q=%20a%20&q=&q=b'))

    expect(parsed.ok && parsed.filters.search).toEqual(['a', 'b'])
  })

  test.each([
    ['type=video'],
    ['projectId=not-a-uuid'],
    ['uploaderId=none'],
    ['createdFrom=2026-08-08'],
    ['limit=0'],
    ['limit=101'],
    ['cursor=broken'],
    ['q=a&q=b&q=c&q=d&q=e&q=f'],
  ])('不正な値（%s）はエラーにする', (query) => {
    expect(parseFileListParams(new URLSearchParams(query)).ok).toBe(false)
  })

  test('プロジェクトなし（none）とプロジェクト ID を受け付ける', () => {
    const none = parseFileListParams(new URLSearchParams('projectId=none'))
    const project = parseFileListParams(new URLSearchParams(`projectId=${UUID}`))

    expect(none.ok && none.filters.projectId).toBe('none')
    expect(project.ok && project.filters.projectId).toBe(UUID)
  })
})

describe('buildFileListSearchParams', () => {
  test('既定の条件ならパラメータを付けない', () => {
    expect(buildFileListSearchParams(DEFAULT_FILE_FILTER_CONDITIONS).toString()).toBe('')
  })

  test('ローカル日付の期間を、開始日の0時から終了日の翌日0時までの時刻にする', () => {
    const params = buildFileListSearchParams({
      ...DEFAULT_FILE_FILTER_CONDITIONS,
      createdFrom: '2026-08-01',
      createdTo: '2026-08-31',
    })

    expect(params.get('createdFrom')).toBe(new Date(2026, 7, 1).toISOString())
    expect(params.get('createdBefore')).toBe(new Date(2026, 8, 1).toISOString())
  })

  test('画面内の検索と上部の検索を両方とも検索語として渡す', () => {
    const params = buildFileListSearchParams(
      { ...DEFAULT_FILE_FILTER_CONDITIONS, search: ' 議事録 ' },
      ['', '8月'],
    )

    expect(params.getAll('q')).toEqual(['議事録', '8月'])
  })

  test('作ったパラメータをサーバー側でそのまま解釈できる', () => {
    const params = buildFileListSearchParams({
      ...DEFAULT_FILE_FILTER_CONDITIONS,
      type: 'img',
      projectId: UUID,
      createdFrom: '2026-08-01',
    })

    expect(parseFileListParams(params).ok).toBe(true)
  })
})

describe('escapeLikePattern', () => {
  test('LIKE のワイルドカードとエスケープ文字をエスケープする', () => {
    expect(escapeLikePattern('50%_off\\')).toBe('50\\%\\_off\\\\')
  })
})
