import { describe, expect, it } from 'vitest'
import { displayProjectLabel } from './use-workspace-settings'

describe('displayProjectLabel', () => {
  const translate = (message: string) => (message === 'Projects' ? 'プロジェクト' : message)

  it('未設定の呼び方だけを表示言語へ訳す', () => {
    expect(displayProjectLabel(null, translate)).toBe('プロジェクト')
    expect(displayProjectLabel(undefined, translate)).toBe('プロジェクト')
    expect(displayProjectLabel('', translate)).toBe('プロジェクト')
  })

  it('保存済みの呼び方は既定の文言と一致してもそのまま出す', () => {
    expect(displayProjectLabel('Projects', translate)).toBe('Projects')
    expect(displayProjectLabel('プロジェクト', translate)).toBe('プロジェクト')
    expect(displayProjectLabel('山行', translate)).toBe('山行')
  })
})
