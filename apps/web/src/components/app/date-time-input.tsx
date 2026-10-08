// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'

type DateTimeInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'defaultValue'> & {
  type: 'date' | 'time'
}

/**
 * 日付・時刻のネイティブ入力。iOS のピッカーにある「リセット」で値が空に戻るようにする。
 *
 * iOS の「リセット」は入力欄を既定値（value 属性）へ戻す。React は制御された入力の value 属性を
 * 現在の値に合わせて書き換えるため、そのままだと「リセット」しても今の値に戻るだけになる。
 * 空の欄はピッカーを開いた時点で今日の日付が入るので、「リセット」で今日の日付になったように見える。
 * 既定値を常に空へ戻しておくと、「リセット」で空になり、その変更が onChange に届く。
 */
export const DateTimeInput = React.forwardRef<HTMLInputElement, DateTimeInputProps>(function DateTimeInput(props, ref) {
  const innerRef = React.useRef<HTMLInputElement | null>(null)

  React.useLayoutEffect(() => {
    const element = innerRef.current
    if (!element) return
    const clearDefault = () => {
      if (element.defaultValue === '') return
      const current = element.value
      element.defaultValue = ''
      // 表示中の値が既定値から来ていた場合（サーバー描画の直後など）は、既定値を空にすると表示も消える
      if (element.value !== current) element.value = current
    }
    clearDefault()
    // React は描画時だけでなく、変更イベントを処理し終えた後にも value 属性を書き戻す。
    // 描画に合わせて空にするだけでは上書きされるため、属性が変わるたびに空へ戻す
    const observer = new MutationObserver(clearDefault)
    observer.observe(element, { attributes: true, attributeFilter: ['value'] })
    return () => observer.disconnect()
  }, [])

  return (
    <input
      {...props}
      ref={(element) => {
        innerRef.current = element
        if (typeof ref === 'function') ref(element)
        else if (ref) ref.current = element
      }}
    />
  )
})
