// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'

/**
 * コマンドの実行時ハンドラレジストリ。
 *
 * 画面コンポーネントは useCommand(id, handler) で「そのコマンドの実体」を登録する。
 * ディスパッチャ（use-command-dispatcher）や コマンドパレットは invoke(id) で実行し、
 * has(id) で「今そのコマンドが有効か（ハンドラが登録されているか）」を判定できる。
 */

interface RegistryValue {
  register: (id: string, handler: () => void) => () => void
  invoke: (id: string) => void
  has: (id: string) => boolean
  /** register/unregister のたびに増える。パレット等の再評価トリガ */
  version: number
}

const RegistryContext = React.createContext<RegistryValue | null>(null)

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const handlers = React.useRef(new Map<string, () => void>())
  const [version, setVersion] = React.useState(0)

  const register = React.useCallback((id: string, handler: () => void) => {
    handlers.current.set(id, handler)
    setVersion(v => v + 1)
    return () => {
      // ルート遷移で新旧ページが一瞬重なっても、自分の wrapper の時だけ削除する
      if (handlers.current.get(id) === handler) {
        handlers.current.delete(id)
        setVersion(v => v + 1)
      }
    }
  }, [])

  const invoke = React.useCallback((id: string) => {
    const h = handlers.current.get(id)
    if (h) h()
    else if (process.env.NODE_ENV !== 'production') console.warn(`[commands] ハンドラ未登録: "${id}"`)
  }, [])

  const has = React.useCallback((id: string) => handlers.current.has(id), [])

  const value = React.useMemo<RegistryValue>(() => ({ register, invoke, has, version }), [register, invoke, has, version])
  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>
}

export function useCommandRegistry(): RegistryValue {
  const ctx = React.useContext(RegistryContext)
  if (!ctx) throw new Error('useCommandRegistry は CommandProvider の内側で使ってください')
  return ctx
}

/**
 * コマンドのハンドラを登録する。handler は毎レンダー最新を ref 経由で参照するため、
 * 依存配列は不要（クロージャの陳腐化なし）。enabled=false の間は登録しない。
 * CommandProvider の外（単体テスト等でページを単独描画する場合）では何もしない。
 *
 * 依存は安定参照の register のみ。ctx 全体に依存すると register が version を増やす
 * たびに ctx 識別子が変わり、登録→version増→再登録… の無限ループになる。
 */
export function useCommand(id: string, handler: () => void, enabled = true): void {
  const register = React.useContext(RegistryContext)?.register
  const ref = React.useRef(handler)
  ref.current = handler
  React.useEffect(() => {
    if (!enabled || !register) return
    const stable = () => ref.current()
    return register(id, stable)
  }, [id, enabled, register])
}

/**
 * 複数コマンドをまとめて登録する（フックをループで呼べないため、1 effect でまとめる）。
 * handlers のキー集合が変わらない限り再登録しない。値（ハンドラ）は ref で常に最新。
 */
export function useCommands(handlers: Record<string, () => void>): void {
  const register = React.useContext(RegistryContext)?.register
  const ref = React.useRef(handlers)
  ref.current = handlers
  const ids = Object.keys(handlers).sort().join(',')
  React.useEffect(() => {
    if (!register) return
    const offs = Object.keys(ref.current).map(id => register(id, () => ref.current[id]?.()))
    return () => offs.forEach(off => off())
  }, [ids, register])
}
