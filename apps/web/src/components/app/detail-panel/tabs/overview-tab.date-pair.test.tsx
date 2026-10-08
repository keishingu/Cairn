// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { InlineDatePair, MilestoneCreateForm } from './overview-tab'

vi.mock('@/components/locale-provider', () => ({ useT: () => (message: string) => message }))

function openEditor(onSave = vi.fn()) {
  render(<InlineDatePair startDate="2026-06-12" endDate="2026-06-16" onSave={onSave}/>)
  fireEvent.click(screen.getByRole('button'))
  return onSave
}

describe('日程のインライン編集（InlineDatePair）', () => {
  it('ネイティブピッカーを閉じた時の移動先のない blur では編集を閉じず、終了日を入力できる', () => {
    const onSave = openEditor()

    fireEvent.blur(screen.getByLabelText('Start date'), { relatedTarget: null })

    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-06-18' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('2026-06-12', '2026-06-18', null, null)
    expect(screen.queryByLabelText('End date')).toBeNull()
  })

  it('ペアの外を押すと確定し、続けて blur が来ても保存は1回だけ', () => {
    const onSave = openEditor()
    const startInput = screen.getByLabelText('Start date')

    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-06-20' } })
    fireEvent.pointerDown(document.body)
    fireEvent.blur(startInput, { relatedTarget: document.body })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('2026-06-12', '2026-06-20', null, null)
  })

  it('開始日から終了日へフォーカスを移しても確定しない', () => {
    const onSave = openEditor()

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-06-10' } })
    fireEvent.blur(screen.getByLabelText('Start date'), { relatedTarget: screen.getByLabelText('End date') })

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByLabelText('End date')).toBeTruthy()
  })

  it('終了日が開始日より前の間はエラーを表示し、完了でも外側の押下でも保存しない', () => {
    const onSave = openEditor()

    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-06-10' } })

    expect(screen.getByRole('alert')).toHaveTextContent('End date must be on or after the start date')
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled()
    fireEvent.pointerDown(document.body)
    fireEvent.keyDown(screen.getByLabelText('End date'), { key: 'Enter' })
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByLabelText('End date')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-06-14' } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onSave).toHaveBeenCalledWith('2026-06-12', '2026-06-14', null, null)
  })

  it('「削除」で日付と時刻をすべて空にし、「完了」を押した時に保存する', () => {
    const onSave = vi.fn()
    render(<InlineDatePair startDate="2026-06-12" endDate="2026-06-16" startTime="10:00:00" endTime="12:00:00" onSave={onSave}/>)
    fireEvent.click(screen.getByRole('button'))

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByLabelText('Start date')).toHaveValue('')
    expect(screen.getByLabelText('End date')).toHaveValue('')
    expect(screen.getByLabelText('Start time')).toHaveValue('')
    expect(screen.getByLabelText('End time')).toHaveValue('')
    // 誤って押しても取り消せるよう、押しただけでは保存しない
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onSave).toHaveBeenCalledWith(null, null, null, null)
  })

  it('「削除」の後でも、キャンセルすれば元の日程のまま保存しない', () => {
    const onSave = openEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toHaveTextContent('6/12')
  })

  it('逆転したままでもキャンセルで編集をやめられ、保存しない', () => {
    const onSave = openEditor()

    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-06-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('End date')).toBeNull()
  })
})

describe('マイルストーン追加フォーム（MilestoneCreateForm）', () => {
  it('終了日が開始日より前の間は作成できず、入力を残したままエラーを表示する', () => {
    const onCreate = vi.fn()
    render(<MilestoneCreateForm onCreate={onCreate}/>)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: '下見' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-06-12' } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-06-10' } })

    expect(screen.getByRole('alert')).toHaveTextContent('End date must be on or after the start date')
    expect(screen.getByRole('button', { name: 'Create entry' })).toBeDisabled()
    fireEvent.submit(screen.getByPlaceholderText('Title').closest('form')!)
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('Title')).toHaveValue('下見')

    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-06-13' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }))
    expect(onCreate).toHaveBeenCalledWith({ title: '下見', startDate: '2026-06-12', endDate: '2026-06-13' })
  })
})
