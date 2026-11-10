// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { InlineDatePair } from './overview-tab'
import { AppShellContext } from '../../app-shell-context'

function renderOnMobile(ui: React.ReactElement) {
  return render(
    <AppShellContext.Provider value={{
      openPanel: () => {}, openMember: () => {}, openNotif: () => {}, isWebView: false, isMobile: true,
      projectsView: 'list', setProjectsView: () => {}, crossSearchNonce: 0, consumeCrossSearch: () => {},
    }}>
      {ui}
    </AppShellContext.Provider>,
  )
}

function tapDay(day: number) {
  const cell = screen.getAllByRole('gridcell').find(c => c.textContent === String(day))
  if (!cell) throw new Error(`day ${day} not found`)
  fireEvent.click(cell)
}

vi.mock('@/components/locale-provider', () => ({ useT: () => (message: string) => message, useLocale: () => ({ locale: 'en' }) }))

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

  it('逆転したままでもキャンセルで編集をやめられ、保存しない', () => {
    const onSave = openEditor()

    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-06-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('End date')).toBeNull()
  })
})

describe('モバイルの日程シート（InlineDatePair）', () => {
  it('終了日を選び直して保存すると、開始日を保ったまま1回だけ保存する', () => {
    const onSave = vi.fn()
    renderOnMobile(<InlineDatePair startDate="2026-06-12" endDate="2026-06-16" onSave={onSave} withTime={false}/>)
    fireEvent.click(screen.getByRole('button', { name: /6\/12/ }))

    fireEvent.click(screen.getByRole('button', { name: /End date/ }))
    tapDay(18)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('2026-06-12', '2026-06-18', null, null)
    expect(screen.queryByRole('grid')).toBeNull()
  })

  it('キャンセルでは選び直した日程を保存しない', () => {
    const onSave = vi.fn()
    renderOnMobile(<InlineDatePair startDate="2026-06-12" endDate="2026-06-16" onSave={onSave} withTime={false}/>)
    fireEvent.click(screen.getByRole('button', { name: /6\/12/ }))

    tapDay(20)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByRole('grid')).toBeNull()
  })

  it('プロジェクトの日程（時刻なし）では時刻欄を出さない', () => {
    renderOnMobile(<InlineDatePair startDate="2026-06-12" endDate="2026-06-16" onSave={vi.fn()} withTime={false}/>)
    fireEvent.click(screen.getByRole('button', { name: /6\/12/ }))

    expect(screen.queryByLabelText('Start time')).toBeNull()
  })

  it('マイルストーンは時刻も保存し、変更していない時刻は保ったまま送る', () => {
    const onSave = vi.fn()
    renderOnMobile(<InlineDatePair startDate="2026-06-14" endDate="2026-06-14" startTime="03:24:00" onSave={onSave}/>)
    fireEvent.click(screen.getByRole('button', { name: /6\/14/ }))

    fireEvent.click(screen.getByRole('button', { name: /End date/ }))
    tapDay(15)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith('2026-06-14', '2026-06-15', '03:24', null)
  })
})
