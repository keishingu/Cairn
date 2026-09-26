// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'
import { toast } from '@/lib/toast'
import { Icon } from './primitives'

const COPIED_MS = 2000

interface CopyButtonProps {
  /** コピーする文字列。押した時点の値を組み立てる場合は関数で渡す */
  text: string | (() => string)
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
  /** クリップボードへの書き込みに失敗したときのトースト文言 */
  errorMessage?: string
}

/**
 * 値をコピーするボタン。成功は押したボタン自身の表示（「コピー済み」）で返し、トーストは出さない。
 * 失敗だけはボタンの表示では気づきにくいのでトーストで知らせる。
 * メニューから実行してボタンが消えるコピー（チャットのメッセージコピー等）は `toast.success` を使う。
 */
export const CopyButton = ({ text, className = 'btn btn-sm', style, disabled, errorMessage }: CopyButtonProps) => {
  const t = useT()
  const [copied, setCopied] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // コピー対象が変わったら（招待リンクの再発行など）表示を戻し、前の対象への書き込み完了も無視する。
  // 関数で渡された対象は描画ごとに参照が変わるため、文字列のときだけ比較する
  const generationRef = React.useRef(0)
  const staticTarget = typeof text === 'string' ? text : null
  React.useEffect(() => {
    generationRef.current++
    setCopied(false)
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [staticTarget])

  React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const copy = async () => {
    const generation = generationRef.current
    try {
      await navigator.clipboard.writeText(typeof text === 'function' ? text() : text)
      if (generation !== generationRef.current) return
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), COPIED_MS)
    } catch {
      setCopied(false)
      toast.error(errorMessage ?? t('Could not copy'))
    }
  }

  return (
    <button type="button" className={className} style={style} disabled={disabled} onClick={() => void copy()}>
      <Icon name={copied ? 'check' : 'copy'} size={12} strokeWidth={copied ? 2.4 : 1.7} />
      <span aria-live="polite">{copied ? t('Copied') : t('Copy')}</span>
    </button>
  )
}
