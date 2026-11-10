import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { InlineFileNameEditor } from './inline-file-name-editor'

vi.mock('@/components/locale-provider', () => ({ useT: () => (message: string) => message }))

function setup(onSave = vi.fn().mockResolvedValue(undefined)) {
  const onCancel = vi.fn()
  render(<InlineFileNameEditor fileName="report.pdf" onSave={onSave} onCancel={onCancel} />)
  return { onSave, onCancel, input: screen.getByLabelText('Change file name') }
}

describe('ファイル名のインライン編集（InlineFileNameEditor）', () => {
  it('blur では保存も破棄もしない', () => {
    const { onSave, onCancel, input } = setup()

    fireEvent.change(input, { target: { value: 'new.pdf' } })
    fireEvent.blur(input)

    expect(onSave).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    expect(input).toHaveValue('new.pdf')
  })

  it('Enter で保存し、成功したら編集を閉じる', async () => {
    const { onSave, onCancel, input } = setup()

    fireEvent.change(input, { target: { value: 'new.pdf' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith('new.pdf')
  })

  it('保存ボタンで保存できる。変更がなければ無効', async () => {
    const { onSave, input } = setup()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.change(input, { target: { value: 'new.pdf' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('new.pdf'))
  })

  it('Esc とキャンセルボタンは保存せずに閉じる', () => {
    const { onSave, onCancel, input } = setup()

    fireEvent.change(input, { target: { value: 'new.pdf' } })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('保存に失敗したら閉じずに下書きを残す', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('失敗'))
    const { onCancel, input } = setup(onSave)

    fireEvent.change(input, { target: { value: 'new.pdf' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onCancel).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByLabelText('Change file name')).toHaveValue('new.pdf'))
  })
})
