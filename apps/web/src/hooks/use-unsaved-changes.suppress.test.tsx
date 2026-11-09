import { render } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { suppressUnsavedChangesUnload, useUnsavedChanges } from './use-unsaved-changes'

const Probe = () => {
  useUnsavedChanges(true)
  return null
}

// モジュールの状態（抑止フラグ）はページの寿命の間続くので、他のテストと分けたファイルで確認する
describe('確認済みの全画面遷移（suppressUnsavedChangesUnload）', () => {
  it('呼ぶ前は beforeunload を止め、呼んだ後は止めない（確認の二重表示を避ける）', () => {
    render(<Probe />)
    const before = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(before)
    expect(before.defaultPrevented).toBe(true)

    suppressUnsavedChangesUnload()

    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })
})
