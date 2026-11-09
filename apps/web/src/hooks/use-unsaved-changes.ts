'use client'

import React from 'react'

/**
 * 未保存の編集内容（テキストの下書き）を持つ編集欄の登録簿。
 * 画面遷移やパネルを閉じる操作の前に `confirmDiscardUnsavedChanges()` で確認するために使う。
 */
const dirtyRegistry = new Set<symbol>()

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
  React.useEffect(() => {
    if (!dirty) return
    const token = Symbol('unsaved-changes')
    dirtyRegistry.add(token)
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // 古いブラウザは returnValue の設定がないと確認を出さない
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      dirtyRegistry.delete(token)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [dirty])
}
