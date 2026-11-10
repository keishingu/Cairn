import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useDraftScope } from '@/hooks/use-draft-scope'
import { FileNameDraftMarker, InlineFileNameEditor } from './inline-file-name-editor'

vi.mock('@/components/locale-provider', () => ({ useT: () => (message: string) => message }))

function setup(onSave = vi.fn().mockResolvedValue(undefined)) {
  const onCancel = vi.fn()
  render(<InlineFileNameEditor fileId="file-1" fileName="report.pdf" onSave={onSave} onCancel={onCancel} />)
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

  it('下書きは閉じ方に関わらず残り、開き直すと復元のお知らせと破棄ボタンを出す', () => {
    const first = setup()
    fireEvent.change(first.input, { target: { value: 'draft.pdf' } })
    cleanup()

    const second = setup()
    expect(second.input).toHaveValue('draft.pdf')
    expect(screen.getByText('Restored your unsaved draft.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    expect(second.input).toHaveValue('report.pdf')
    cleanup()

    expect(setup().input).toHaveValue('report.pdf')
  })

  it('キャンセルと保存成功で下書きを消す', async () => {
    const first = setup()
    fireEvent.change(first.input, { target: { value: 'draft.pdf' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    cleanup()
    expect(setup().input).toHaveValue('report.pdf')
    cleanup()

    const third = setup()
    fireEvent.change(third.input, { target: { value: 'saved.pdf' } })
    fireEvent.keyDown(third.input, { key: 'Enter' })
    await waitFor(() => expect(third.onCancel).toHaveBeenCalled())
    cleanup()

    expect(setup().input).toHaveValue('report.pdf')
  })

  it('表示モードの印は、下書きがあるときだけ出す', () => {
    const view = render(<FileNameDraftMarker fileId="file-1" fileName="report.pdf" />)
    expect(screen.queryByText('Unsaved draft')).toBeNull()
    view.unmount()

    const editor = setup()
    fireEvent.change(editor.input, { target: { value: 'draft.pdf' } })
    cleanup()

    render(<FileNameDraftMarker fileId="file-1" fileName="report.pdf" />)
    expect(screen.getByText('Unsaved draft')).toBeInTheDocument()
  })

  it('下書きの読み取り前（スコープ取得待ち）に入力した名前は、古い下書きで上書きされず、下書きとして残る', async () => {
    window.localStorage.setItem(
      'cairn:draft:user-1:ws-1:file:file-1:name',
      JSON.stringify({ value: 'old.pdf', base: 'report.pdf', updatedAt: Date.now() }),
    )
    vi.mocked(useDraftScope).mockImplementation(() => ({ scope: null, settled: false }))
    const { input, view } = (() => {
      const onSave = vi.fn().mockResolvedValue(undefined)
      const v = render(<InlineFileNameEditor fileId="file-1" fileName="report.pdf" onSave={onSave} onCancel={vi.fn()} />)
      return { input: screen.getByLabelText('Change file name'), view: v }
    })()

    fireEvent.change(input, { target: { value: 'fresh.pdf' } })
    vi.mocked(useDraftScope).mockImplementation(() => ({ scope: { userId: 'user-1', workspaceId: 'ws-1' }, settled: true }))
    view.rerender(<InlineFileNameEditor fileId="file-1" fileName="report.pdf" onSave={vi.fn()} onCancel={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText('Change file name')).toHaveValue('fresh.pdf'))
    expect(screen.queryByText('Restored your unsaved draft.')).toBeNull()
    view.unmount()
    expect(JSON.parse(window.localStorage.getItem('cairn:draft:user-1:ws-1:file:file-1:name')!).value).toBe('fresh.pdf')
  })
})
