// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { DateTimeInput } from './date-time-input'

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = React.useState(initial)
  return (
    <>
      <DateTimeInput type="date" aria-label="date" value={value} onChange={event => setValue(event.target.value)}/>
      <output>{value === '' ? 'empty' : value}</output>
    </>
  )
}

/** iOS のピッカーの「リセット」は、入力欄を既定値（value 属性）へ戻して変更を通知する */
function pressIosReset(input: HTMLInputElement) {
  fireEvent.change(input, { target: { value: input.defaultValue } })
}

describe('日付・時刻の入力欄（DateTimeInput）', () => {
  it('値を表示したまま、既定値だけを空にしておく', () => {
    render(<Harness initial="2026-06-12"/>)
    const input = screen.getByLabelText('date') as HTMLInputElement

    expect(input.value).toBe('2026-06-12')
    expect(input.defaultValue).toBe('')
  })

  it('iOS の「リセット」で、今の値や今日の日付ではなく空になる', () => {
    render(<Harness initial="2026-06-12"/>)
    const input = screen.getByLabelText('date') as HTMLInputElement

    pressIosReset(input)

    expect(input.value).toBe('')
    expect(screen.getByText('empty')).toBeInTheDocument()
  })

  it('空の欄に日付を入れた後（ピッカーを開くと今日の日付が入る）でも、「リセット」で空に戻る', async () => {
    render(<Harness initial=""/>)
    const input = screen.getByLabelText('date') as HTMLInputElement

    fireEvent.change(input, { target: { value: '2026-10-08' } })
    // React が変更の処理後に書き戻した既定値も、空へ戻っていること
    await waitFor(() => expect(input.defaultValue).toBe(''))
    expect(input.value).toBe('2026-10-08')
    pressIosReset(input)

    expect(screen.getByText('empty')).toBeInTheDocument()
  })
})
