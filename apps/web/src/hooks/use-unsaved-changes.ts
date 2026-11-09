'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'

/**
 * 未保存の編集内容（テキストの下書き）を持つ編集欄の登録簿。
 * 画面遷移やパネルを閉じる操作の前に `confirmDiscardUnsavedChanges()` で確認するために使う。
 */
const dirtyRegistry = new Set<symbol>()

/** リンク遷移の確認に使う文言。dirty な編集欄が登録したときの表示言語の文言を保持する。 */
let leaveMessage = 'You have unsaved changes. Discard them and leave?'

/**
 * 同一オリジンの内部リンクのクリックを、dirty な間だけ確認する（クライアント遷移では beforeunload が働かない）。
 * 登録簿が 0→1 になったときに1つだけ追加し、0 に戻ったら外す。
 * 修飾キー・左ボタン以外・別タブ・ダウンロード・ハッシュのみ・現在のパスへのリンクは対象外。
 * 自前で確認済みのリンクは `data-skip-unsaved-guard` を付けて除外する。
 */
function onDocumentClick(e: MouseEvent): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const target = e.target
  if (!(target instanceof Element)) return
  const anchor = target.closest<HTMLAnchorElement>('a[href]')
  if (!anchor || anchor.closest('[data-skip-unsaved-guard]')) return
  if (anchor.target && anchor.target !== '_self') return
  if (anchor.hasAttribute('download')) return
  let url: URL
  try {
    url = new URL(anchor.href, window.location.href)
  } catch {
    return
  }
  if (url.origin !== window.location.origin) return
  if (url.pathname === window.location.pathname && url.search === window.location.search) return
  if (!confirmDiscardUnsavedChanges(leaveMessage)) {
    e.preventDefault()
    e.stopPropagation()
  }
}

/** 未保存の編集が1つでもあるか。 */
export function hasUnsavedChanges(): boolean {
  return dirtyRegistry.size > 0
}

/**
 * 未保存の編集がなければ true。あれば破棄してよいかをユーザーに確認し、承諾されたときだけ true を返す。
 * 遷移・クローズの直前に呼び、false なら操作を中止する。
 */
export function confirmDiscardUnsavedChanges(message: string): boolean {
  if (!hasUnsavedChanges()) return true
  return window.confirm(message)
}

/**
 * `dirty` の間だけ、(a) ブラウザのタブを閉じる・リロード時の警告（beforeunload）と
 * (b) 登録簿への登録を行う。編集欄のアンマウントでも解除される。
 */
export function useUnsavedChanges(dirty: boolean): void {
  const t = useT()
  const message = t('You have unsaved changes. Discard them and leave?')
  React.useEffect(() => {
    if (!dirty) return
    const token = Symbol('unsaved-changes')
    leaveMessage = message
    if (dirtyRegistry.size === 0) document.addEventListener('click', onDocumentClick, true)
    dirtyRegistry.add(token)
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // 古いブラウザは returnValue の設定がないと確認を出さない
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      dirtyRegistry.delete(token)
      if (dirtyRegistry.size === 0) document.removeEventListener('click', onDocumentClick, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [dirty, message])
}
