import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DateRangeSheet } from './date-range-sheet'

vi.mock('@/components/locale-provider', () => ({
  useT: () => (message: string) => message,
  useLocale: () => ({ locale: 'en' }),
}))

function setup(onSave: ReturnType<typeof vi.fn>) {
  const onClose = vi.fn()
  render(
    <DateRangeSheet title="Dates" startDate="2026-06-12" endDate="2026-06-16" onSave={onSave} onClose={onClose} />,
  )
  return { onClose }
}

describe('日程シート（DateRangeSheet）', () => {
  it('保存に失敗したらシートを閉じず、選んだ日付を残してエラーを表示する', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('サーバーエラー'))
    const { onClose } = setup(onSave)

    fireEvent.click(screen.getByRole('button', { name: /End date/ }))
    fireEvent.click(screen.getAllByRole('gridcell').find(c => c.textContent === '20')!)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('サーバーエラー')).toBeInTheDocument()
    expect(onSave).toHaveBeenCalledWith('2026-06-12', '2026-06-20', null, null)
    expect(onClose).not.toHaveBeenCalled()
    // 選んだ終了日はそのまま残り、直して再保存できる
    expect(screen.getByRole('button', { name: /End date/ })).toHaveTextContent(/20/)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled())
  })

  it('保存に成功したらシートを閉じる', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { onClose } = setup(onSave)

    fireEvent.click(screen.getByRole('button', { name: /End date/ }))
    fireEvent.click(screen.getAllByRole('gridcell').find(c => c.textContent === '20')!)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('保存中は保存ボタンと日付の入力を無効にする', async () => {
    let resolve!: () => void
    const onSave = vi.fn().mockReturnValue(new Promise<void>(r => { resolve = r }))
    setup(onSave)

    fireEvent.click(screen.getByRole('button', { name: /End date/ }))
    fireEvent.click(screen.getAllByRole('gridcell').find(c => c.textContent === '20')!)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled())
    expect(screen.getAllByRole('gridcell')[0]).toBeDisabled()
    resolve()
  })
})
