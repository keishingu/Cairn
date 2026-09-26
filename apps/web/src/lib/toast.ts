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

// エラーは読み取り・対処に時間がかかるため成功/情報より長く出す
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 4000,
  info: 4000,
  error: 6000,
}
// 連打などで積み上がると画面を覆うため、同時表示数を絞って古いものから消す
const MAX_VISIBLE = 3

interface TimerState {
  handle: ReturnType<typeof setTimeout> | null
  remaining: number
  startedAt: number
}

let toasts: ToastItem[] = []
let listeners: Listener[] = []
let nextId = 1
const timers = new Map<number, TimerState>()

function emit() {
  for (const listener of listeners) listener(toasts)
}

function clearTimer(id: number) {
  const timer = timers.get(id)
  if (timer?.handle) clearTimeout(timer.handle)
  timers.delete(id)
}

function startTimer(id: number, duration: number) {
  clearTimer(id)
  if (duration <= 0 || typeof setTimeout === 'undefined') return
  timers.set(id, {
    handle: setTimeout(() => dismissToast(id), duration),
    remaining: duration,
    startedAt: Date.now(),
  })
}

/** Toaster コンポーネントが購読する。現在のリストを即時に1回通知し、解除関数を返す。 */
export function subscribeToasts(listener: Listener): () => void {
  listeners = [...listeners, listener]
  listener(toasts)
  return () => { listeners = listeners.filter(l => l !== listener) }
}

export function dismissToast(id: number) {
  clearTimer(id)
  toasts = toasts.filter(t => t.id !== id)
  emit()
}

/** ホバー・フォーカス中は読み終わる前に消えないよう自動消去を止める。 */
export function pauseToast(id: number) {
  const timer = timers.get(id)
  if (!timer?.handle) return
  clearTimeout(timer.handle)
  timer.handle = null
  timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt))
}

export function resumeToast(id: number) {
  const timer = timers.get(id)
  if (!timer || timer.handle) return
  // 読み終えた直後に消えるのを避けるため、最低 1 秒は残す
  startTimer(id, Math.max(timer.remaining, 1000))
}

interface ToastOptions {
  /** 自動で消えるまでのミリ秒。0 で自動消去しない。 */
  duration?: number
}

function push(message: string, variant: ToastVariant, options?: ToastOptions): number {
  const duration = options?.duration ?? DEFAULT_DURATION[variant]

  // 同じ内容が表示中なら積まずに表示時間だけ延ばす（コピー連打などで同じ行が並ぶのを防ぐ）
  const existing = toasts.find(t => t.message === message && t.variant === variant)
  if (existing) {
    startTimer(existing.id, duration)
    return existing.id
  }

  const id = nextId++
  toasts = [...toasts, { id, message, variant }]
  const overflow = toasts.slice(0, Math.max(0, toasts.length - MAX_VISIBLE))
  for (const t of overflow) clearTimer(t.id)
  toasts = toasts.slice(overflow.length)
  emit()
  startTimer(id, duration)
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
  for (const id of [...timers.keys()]) clearTimer(id)
  toasts = []
  listeners = []
  nextId = 1
}
