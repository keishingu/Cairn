import { describe, expect, it } from 'vitest'
import { isImeConfirmingEnter } from './ime'

function createEvent(overrides?: { isComposing?: boolean; keyCode?: number }) {
  return {
    nativeEvent: {
      isComposing: overrides?.isComposing,
      keyCode: overrides?.keyCode,
    },
  } as React.KeyboardEvent<HTMLInputElement>
}

describe('isImeConfirmingEnter', () => {
  it('composition 中フラグが立っている場合は true を返す', () => {
    expect(isImeConfirmingEnter(createEvent(), true)).toBe(true)
  })

  it('nativeEvent.isComposing が true の場合は true を返す', () => {
    expect(isImeConfirmingEnter(createEvent({ isComposing: true }), false)).toBe(true)
  })

  it('keyCode 229 の場合は true を返す', () => {
    expect(isImeConfirmingEnter(createEvent({ keyCode: 229 }), false)).toBe(true)
  })

  it('通常の Enter では false を返す', () => {
    expect(isImeConfirmingEnter(createEvent({ isComposing: false, keyCode: 13 }), false)).toBe(false)
  })
})
