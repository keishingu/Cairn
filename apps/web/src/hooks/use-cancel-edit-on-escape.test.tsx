import { fireEvent, render } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useCancelEditOnEscape } from './use-cancel-edit-on-escape'

const Editor = ({ onCancel }: { onCancel: () => void }) => {
  const ref = React.useRef<HTMLDivElement>(null)
  useCancelEditOnEscape(ref, true, onCancel)
  return <div ref={ref}><input aria-label="入力" /></div>
}

describe('Esc で編集を取り消すフック（useCancelEditOnEscape）', () => {
  it('編集欄の中にフォーカスがあるときの Esc で取り消す', () => {
    const onCancel = vi.fn()
    const { getByLabelText } = render(<Editor onCancel={onCancel} />)
    fireEvent.keyDown(getByLabelText('入力'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('IME 変換中（isComposing）の Esc では取り消さない', () => {
    const onCancel = vi.fn()
    const { getByLabelText } = render(<Editor onCancel={onCancel} />)
    fireEvent.keyDown(getByLabelText('入力'), { key: 'Escape', isComposing: true })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('フォーカスが編集欄の外にあるときの Esc には反応しない', () => {
    const onCancel = vi.fn()
    render(<Editor onCancel={onCancel} />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })
})
