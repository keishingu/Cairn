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

  it('編集欄が2つ開いているとき、Esc はフォーカスのある方だけ取り消す', () => {
    render(
      <>
        <InlineText value="タイトル" onSave={vi.fn()} />
        <InlineText value="概要" onSave={vi.fn()} multiline />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'タイトル' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'タイトル下書き' } })
    fireEvent.click(screen.getByRole('button', { name: '概要' }))
    const [first, second] = screen.getAllByRole('textbox')
    fireEvent.change(second!, { target: { value: '概要下書き' } })

    second!.focus()
    fireEvent.keyDown(second!, { key: 'Escape' })

    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(first).toHaveValue('タイトル下書き')
  })

  describe('下書きの永続化（draftKey）', () => {
    const KEY = 'project:p1:title'
    const stored = () => window.localStorage.getItem('cairn:draft:user-1:ws-1:' + KEY)

    function renderField(value = '元の値', onSave = vi.fn().mockResolvedValue(undefined)) {
      const view = render(<InlineText value={value} onSave={onSave} draftKey={KEY} />)
      return { ...view, onSave }
    }

    it('アンマウントしても下書きが残り、開き直すと下書きを入れて復元のお知らせを出す', () => {
      const first = renderField()
      fireEvent.click(screen.getByRole('button'))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '書きかけ' } })
      first.unmount()
      expect(JSON.parse(stored()!)).toMatchObject({ value: '書きかけ', base: '元の値' })

      renderField()
      // 表示モードでは下書きの印を出す
      expect(screen.getByText('Unsaved draft')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '元の値' }))

      expect(screen.getByRole('textbox')).toHaveValue('書きかけ')
      expect(screen.getByText('Restored your unsaved draft.')).toBeInTheDocument()
      expect(screen.queryByText('The saved content has changed since you wrote this draft.')).toBeNull()
    })

    it('「下書きを破棄」で保存済みの値へ戻し、保存領域からも消す', () => {
      const first = renderField()
      fireEvent.click(screen.getByRole('button'))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '書きかけ' } })
      first.unmount()

      renderField()
      fireEvent.click(screen.getByRole('button', { name: '元の値' }))
      fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))

      expect(screen.getByRole('textbox')).toHaveValue('元の値')
      expect(screen.queryByText('Restored your unsaved draft.')).toBeNull()
      expect(stored()).toBeNull()
    })

    it('保存に成功すると下書きを消す', async () => {
      const first = renderField()
      fireEvent.click(screen.getByRole('button'))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '書きかけ' } })
      first.unmount()

      const second = renderField()
      fireEvent.click(screen.getByRole('button', { name: '元の値' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
      expect(second.onSave).toHaveBeenCalledWith('書きかけ')
      expect(stored()).toBeNull()
      // 閉じ方に関わらず、保存後にアンマウントしても下書きは復活しない
      second.unmount()
      expect(stored()).toBeNull()
    })

    it('保存に失敗したときは下書きを残す', async () => {
      const onSave = vi.fn().mockRejectedValue(new Error('サーバーエラー'))
      const view = renderField('元の値', onSave)
      fireEvent.click(screen.getByRole('button'))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '書きかけ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await screen.findByText('サーバーエラー')
      view.unmount()

      expect(JSON.parse(stored()!).value).toBe('書きかけ')
    })

    it('キャンセルと Esc で下書きを消す', () => {
      const view = renderField()
      fireEvent.click(screen.getByRole('button'))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '書きかけ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      view.unmount()
      expect(stored()).toBeNull()

      const again = renderField()
      fireEvent.click(screen.getByRole('button'))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '別の書きかけ' } })
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
      again.unmount()
      expect(stored()).toBeNull()
    })

    it('入力を保存済みの値に戻したら下書きを消す', () => {
      const view = renderField()
      fireEvent.click(screen.getByRole('button'))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '書きかけ' } })
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '元の値' } })
      view.unmount()

      expect(stored()).toBeNull()
    })

    it('下書きを書いた後に保存済みの値が変わっていたら、復元時にそのことを知らせる', () => {
      const first = renderField('元の値')
      fireEvent.click(screen.getByRole('button'))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '書きかけ' } })
      first.unmount()

      renderField('他の人が変えた値')
      fireEvent.click(screen.getByRole('button', { name: '他の人が変えた値' }))

      expect(screen.getByText('Restored your unsaved draft. The saved content has changed since you wrote this draft.')).toBeInTheDocument()
    })

    it('draftKey が違う欄の下書きは混ざらない', () => {
      const first = renderField()
      fireEvent.click(screen.getByRole('button'))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '書きかけ' } })
      first.unmount()

      render(<InlineText value="元の値" onSave={vi.fn()} draftKey="project:p2:title" />)
      expect(screen.queryByText('Unsaved draft')).toBeNull()
      fireEvent.click(screen.getByRole('button'))
      expect(screen.getByRole('textbox')).toHaveValue('元の値')
    })

    it('保存領域が使えなくても編集・保存はそのまま動く', async () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
      const view = renderField()
      fireEvent.click(screen.getByRole('button'))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '書きかけ' } })
      view.unmount()
      spy.mockRestore()

      renderField()
      expect(screen.queryByText('Unsaved draft')).toBeNull()
    })
  })
})
