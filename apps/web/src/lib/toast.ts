// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// アプリ全体の一過性フィードバック（削除・保存などの成功/失敗）を統一するための
// 軽量トースト基盤。依存を増やさず、コンポーネント外（mutation の onSuccess/onError 等）
// からも呼べるよう、モジュールレベルの pub/sub ストアとして実装する。

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

type Listener = (toasts: ToastItem[]) => void

const DEFAULT_DURATION = 4000

let toasts: ToastItem[] = []
let listeners: Listener[] = []
let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function emit() {
  for (const listener of listeners) listener(toasts)
}

/** Toaster コンポーネントが購読する。現在のリストを即時に1回通知し、解除関数を返す。 */
export function subscribeToasts(listener: Listener): () => void {
  listeners = [...listeners, listener]
  listener(toasts)
  return () => { listeners = listeners.filter(l => l !== listener) }
}

export function dismissToast(id: number) {
  const timer = timers.get(id)
  if (timer) { clearTimeout(timer); timers.delete(id) }
  toasts = toasts.filter(t => t.id !== id)
  emit()
}

interface ToastOptions {
  /** 自動で消えるまでのミリ秒。0 で自動消去しない。 */
  duration?: number
}

function push(message: string, variant: ToastVariant, options?: ToastOptions): number {
  const id = nextId++
  toasts = [...toasts, { id, message, variant }]
  emit()
  const duration = options?.duration ?? DEFAULT_DURATION
  if (duration > 0 && typeof setTimeout !== 'undefined') {
    timers.set(id, setTimeout(() => dismissToast(id), duration))
  }
  return id
}

export const toast = Object.assign(
  (message: string, options?: ToastOptions) => push(message, 'info', options),
  {
    success: (message: string, options?: ToastOptions) => push(message, 'success', options),
    error:   (message: string, options?: ToastOptions) => push(message, 'error', options),
    info:    (message: string, options?: ToastOptions) => push(message, 'info', options),
    dismiss: dismissToast,
  },
)

/** テスト用にストアを初期化する。 */
export function __resetToastsForTest() {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  toasts = []
  listeners = []
  nextId = 1
}
