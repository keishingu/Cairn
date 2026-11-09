import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { InlineText } from './overview-tab'

vi.mock('@/components/locale-provider', () => ({ useT: () => (message: string) => message }))

function setup(props: Partial<React.ComponentProps<typeof InlineText>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<InlineText value="元の値" onSave={onSave} placeholder="入力" {...props} />)
  fireEvent.click(screen.getByRole('button'))
  return { onSave, input: screen.getByRole('textbox') }
}

describe('テキストのインライン編集（InlineText）', () => {
  it('blur では保存も破棄もせず、下書きを保つ', () => {
    const { onSave, input } = setup()

    fireEvent.change(input, { target: { value: '新しい値' } })
    fireEvent.blur(input)

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('新しい値')
  })

  it('保存ボタンで保存し、成功したら編集を閉じる', async () => {
    const { onSave, input } = setup()

    fireEvent.change(input, { target: { value: '  新しい値  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    expect(onSave).toHaveBeenCalledWith('新しい値')
  })

  it('1行入力は Enter で保存するが、IME 変換中の Enter では保存しない', async () => {
    const { onSave, input } = setup()

    fireEvent.change(input, { target: { value: '新しい値' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('新しい値'))
  })

  it('複数行は Enter では保存せず、Ctrl+Enter で保存する', async () => {
    const { onSave, input } = setup({ multiline: true })

    fireEvent.change(input, { target: { value: '1行目\n2行目' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('1行目\n2行目'))
  })

  it('キャンセルボタンと Esc は下書きを捨てて元の値へ戻す', () => {
    const { onSave, input } = setup()

    fireEvent.change(input, { target: { value: '捨てる' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button')).toHaveTextContent('元の値')

    fireEvent.click(screen.getByRole('button'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'これも捨てる' } })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('button')).toHaveTextContent('元の値')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('変更なし・必須で空のときは保存ボタンを無効にする', () => {
    const { onSave, input } = setup({ required: true })

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('保存に失敗したら編集を閉じず、下書きを残してエラーを表示する', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('サーバーエラー'))
    const { input } = setup({ onSave })

    fireEvent.change(input, { target: { value: '新しい値' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('サーバーエラー')).toBeTruthy()
    expect(screen.getByRole('textbox')).toHaveValue('新しい値')
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })

  it('読み取り専用では編集を開始できない', () => {
    const onSave = vi.fn()
    render(<InlineText value="値" onSave={onSave} readOnly />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
