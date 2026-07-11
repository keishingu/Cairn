import { describe, expect, it } from 'vitest'
import { formatTaskTitleForDisplay } from './task-title-display'

describe('formatTaskTitleForDisplay', () => {
  it('タスク一覧向けにインライン Markdown を外す', () => {
    expect(formatTaskTitleForDisplay('Kei Shingu - **デポジット設計** を `確認` する')).toBe(
      'Kei Shingu - デポジット設計 を 確認 する',
    )
  })

  it('リンクや画像のラベルは残す', () => {
    expect(formatTaskTitleForDisplay('資料 [仕様書](https://example.com) ![図A](https://example.com/a.png)')).toBe(
      '資料 仕様書 図A',
    )
  })

  it('snake_case の識別子に含まれるアンダースコアは残す', () => {
    expect(formatTaskTitleForDisplay('user_display_name と _強調_ を一緒に表示する')).toBe(
      'user_display_name と 強調 を一緒に表示する',
    )
  })
})
