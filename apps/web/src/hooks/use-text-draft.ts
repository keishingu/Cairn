'use client'

import React from 'react'
import { useDraftScope } from './use-draft-scope'
import {
  pruneExpiredDrafts,
  readDraft,
  removeDraft,
  writeDraft,
  type DraftEntry,
  type DraftScope,
} from '@/lib/drafts/draft-store'

/** 入力のたびに書き込まない。打鍵が止まってからまとめて書く。 */
const WRITE_DEBOUNCE_MS = 400
/** 期限切れの掃除は、ページを開いている間に頻繁にはやらない。 */
const PRUNE_INTERVAL_MS = 10 * 60 * 1000
let lastPrunedAt = 0

export interface TextDraft {
  /** 保存領域を読み終えたか（下書きを使えない場合も、使えないと確定した時点で true） */
  loaded: boolean
  /** 端末に残っている下書き。保存済みの値と同じものは含めない。 */
  stored: DraftEntry | null
  /** 保存済みの値が、下書きを書き始めたときから変わっているか */
  baseChanged: boolean
  /** 編集のたびに現在の値を渡す。保存済みの値と同じになったら下書きを消す。 */
  update: (value: string) => void
  /** 保留中の書き込みを今すぐ反映する */
  flush: () => void
  /** 下書きを削除する（保存成功・キャンセル・破棄） */
  clear: () => void
}

/**
 * 編集対象ごとのテキスト下書きを localStorage へ永続化する。
 * `key` は編集対象を一意にする文字列（例: `project:{id}:title`）。null なら何もしない。
 * ユーザー・ワークスペースが確定していない間や、保存領域が使えない間は、下書きが無い場合と同じに振る舞う。
 */
export function useTextDraft({ key, savedValue }: { key: string | null; savedValue: string }): TextDraft {
  const { scope, settled } = useDraftScope()
  const userId = scope?.userId
  const workspaceId = scope?.workspaceId

  // 読み取り結果は、どの key のものかを一緒に持つ（key が変わった直後に前の欄の下書きを見せないため）
  const [state, setState] = React.useState<{ key: string; entry: DraftEntry | null } | null>(null)

  const savedRef = React.useRef(savedValue)
  savedRef.current = savedValue
  const ctxRef = React.useRef<{ scope: DraftScope; key: string } | null>(null)
  const pendingRef = React.useRef<string | null>(null)
  const baseRef = React.useRef<string | null>(null)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const flush = React.useCallback(() => {
    cancelTimer()
    const ctx = ctxRef.current
    const value = pendingRef.current
    pendingRef.current = null
    if (!ctx || value === null) return
    if (value === savedRef.current) {
      removeDraft(ctx.scope, ctx.key)
      setState({ key: ctx.key, entry: null })
      return
    }
    const entry = { value, base: baseRef.current ?? savedRef.current, updatedAt: Date.now() }
    // 書けなかった（容量超過など）ときは、下書きが無いのと同じに扱う
    setState({ key: ctx.key, entry: writeDraft(ctx.scope, ctx.key, entry) ? entry : null })
  }, [cancelTimer])

  // 編集対象（またはユーザー・ワークスペース）が変わるとき・アンマウント時に、保留分を元の対象へ書き切る
  React.useEffect(() => {
    baseRef.current = null
    pendingRef.current = null
    if (key === null || !settled) {
      ctxRef.current = null
      return
    }
    if (!userId || !workspaceId) {
      // ユーザー・ワークスペースを取得できなかった: 下書きなしで動く
      ctxRef.current = null
      setState({ key, entry: null })
      return
    }
    const currentScope = { userId, workspaceId }
    ctxRef.current = { scope: currentScope, key }
    const now = Date.now()
    if (now - lastPrunedAt > PRUNE_INTERVAL_MS) {
      lastPrunedAt = now
      pruneExpiredDrafts(now)
    }
    let entry = readDraft(currentScope, key, now)
    if (entry && entry.value === savedRef.current) {
      // 保存済みの値と同じ下書きは不要
      removeDraft(currentScope, key)
      entry = null
    }
    baseRef.current = entry ? entry.base : null
    setState({ key, entry })
    return () => {
      flush()
      ctxRef.current = null
    }
  }, [key, settled, userId, workspaceId, flush])

  // タブを閉じる・隠す・ページ遷移でアンマウントが走らない場合に備え、保留分を書き切る
  React.useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flush])

  const update = React.useCallback((value: string) => {
    const ctx = ctxRef.current
    if (!ctx) return
    if (value === savedRef.current) {
      // 保存済みの値に戻った
      cancelTimer()
      pendingRef.current = null
      baseRef.current = null
      removeDraft(ctx.scope, ctx.key)
      setState({ key: ctx.key, entry: null })
      return
    }
    if (baseRef.current === null) baseRef.current = savedRef.current
    pendingRef.current = value
    cancelTimer()
    timerRef.current = setTimeout(flush, WRITE_DEBOUNCE_MS)
  }, [cancelTimer, flush])

  const clear = React.useCallback(() => {
    cancelTimer()
    pendingRef.current = null
    baseRef.current = null
    const ctx = ctxRef.current
    if (ctx) removeDraft(ctx.scope, ctx.key)
    setState(prev => (prev ? { ...prev, entry: null } : prev))
  }, [cancelTimer])

  const loaded = key === null ? settled : state !== null && state.key === key
  const stored = key !== null && loaded && state !== null ? state.entry : null

  return {
    loaded,
    stored,
    baseChanged: stored !== null && stored.base !== savedValue,
    update,
    flush,
    clear,
  }
}

export interface DraftField {
  value: string
  /** 入力のたびに呼ぶ。値を更新し、保存済みの値と異なる間は下書きとして端末に残す。 */
  setValue: (value: string) => void
  /** 下書きを復元した直後は非 null。baseChanged は復元時点で保存済みの値が変わっていたか。 */
  restored: { baseChanged: boolean } | null
  /** 下書きを捨てて保存済みの値へ戻す */
  discard: () => void
  /** 保存に成功したとき、保存された値を表示へ反映して下書きとお知らせを消す */
  commit: (savedValue: string) => void
}

/**
 * 常時表示の設定入力欄用。読み込みが終わったら保存済みの値で初期化し、下書きがあればそれを入れて復元を知らせる。
 * `ready` は保存済みの値を取得できたとき true（取得前の仮の値で下書きを判定しない）。
 * `enabled` が false（閲覧のみの権限など）のときは下書きを使わず、保存済みの値に追従するだけ。
 * 保存済みの値が後から変わったときは、入力が未編集（直前の保存済みの値のまま）の場合だけ追従する。
 */
export function useDraftField({
  key, savedValue, ready = true, enabled = true,
}: { key: string; savedValue: string; ready?: boolean; enabled?: boolean }): DraftField {
  const draft = useTextDraft({ key: ready && enabled ? key : null, savedValue })
  const [value, setValueState] = React.useState(savedValue)
  const [restored, setRestored] = React.useState<{ baseChanged: boolean } | null>(null)

  const storedRef = React.useRef(draft.stored)
  storedRef.current = draft.stored
  const baseChangedRef = React.useRef(draft.baseChanged)
  baseChangedRef.current = draft.baseChanged
  const decidedRef = React.useRef(false)
  const syncedRef = React.useRef<string | null>(null)
  // 復元の判定前（ユーザー・ワークスペースや権限の取得待ち）に入力された値。判定後も新しい入力を優先する
  const valueRef = React.useRef(savedValue)
  const touchedRef = React.useRef(false)

  // キー・有効/無効が変わったら復元を判定し直す（権限の確定前は enabled=false で、確定後に true になる）
  React.useEffect(() => {
    decidedRef.current = false
    syncedRef.current = null
    touchedRef.current = false
    setRestored(null)
  }, [key, enabled])

  const { update, clear } = draft
  const waiting = enabled && !draft.loaded
  React.useEffect(() => {
    if (!ready || waiting) return
    const previous = syncedRef.current
    syncedRef.current = savedValue
    if (!decidedRef.current) {
      decidedRef.current = true
      const entry = enabled ? storedRef.current : null
      if (touchedRef.current) {
        // 判定を待つ間に入力があった: 古い下書きや保存済みの値で上書きせず、入力を下書きとして残す
        update(valueRef.current)
      } else if (entry) {
        valueRef.current = entry.value
        setValueState(entry.value)
        setRestored({ baseChanged: baseChangedRef.current })
      } else {
        valueRef.current = savedValue
        setValueState(savedValue)
      }
      return
    }
    setValueState(current => (previous === null || current === previous ? savedValue : current))
  }, [ready, waiting, enabled, savedValue, key, update])

  const setValue = React.useCallback((next: string) => {
    valueRef.current = next
    if (!decidedRef.current) touchedRef.current = true
    setValueState(next)
    update(next)
  }, [update])

  const discard = React.useCallback(() => {
    clear()
    setRestored(null)
    setValueState(savedValue)
  }, [clear, savedValue])

  const commit = React.useCallback((saved: string) => {
    clear()
    setRestored(null)
    setValueState(saved)
  }, [clear])

  return { value, setValue, restored, discard, commit }
}

export interface DraftEditor {
  /** 編集中の値 */
  draft: string
  /** 入力のたびに呼ぶ。値を更新し、保存済みの値と異なる間は下書きとして端末に残す。 */
  setDraft: (value: string) => void
  /** 下書きを復元した直後は非 null（baseChanged は復元時点で保存済みの値が変わっていたか）。 */
  restored: { baseChanged: boolean } | null
  /** 端末に下書きが残っているか（表示モードの印に使う） */
  hasDraft: boolean
  /** 下書きを捨てて保存済みの値へ戻す（編集は続ける） */
  discard: () => void
  /** 保存成功・キャンセルで編集を終えるときに呼ぶ。下書きとお知らせを消し、値を保存済みへ戻す。 */
  finish: () => void
}

/**
 * クリックして編集する欄の下書きをまとめて扱う。`active`（編集中）になった時点で、保存済みの値で始め、
 * 端末に下書きがあれば入れて復元を知らせる。下書きの読み取りが終わる前に入力があった場合は、
 * 古い下書きで上書きせず入力を残して下書きとして保存する（復元とそのお知らせは行わない）。
 * `isSame` は入力値と保存済みの値を「同じ」とみなす比較（前後の空白を無視するなど）。
 * 編集を閉じる（active が false になる）ときは保留中の書き込みを書き切る。
 */
export function useDraftEditor({
  key, savedValue, active, isSame,
}: {
  key: string | null
  savedValue: string
  active: boolean
  isSame?: (value: string, saved: string) => boolean
}): DraftEditor {
  const store = useTextDraft({ key, savedValue })
  const { update, clear, flush } = store
  const [draft, setDraftState] = React.useState(savedValue)
  const [restored, setRestored] = React.useState<{ baseChanged: boolean } | null>(null)

  const savedRef = React.useRef(savedValue)
  savedRef.current = savedValue
  const isSameRef = React.useRef(isSame)
  isSameRef.current = isSame
  const storedRef = React.useRef(store.stored)
  storedRef.current = store.stored
  const valueRef = React.useRef(savedValue)
  const decidedRef = React.useRef(false)
  const touchedRef = React.useRef(false)

  const push = React.useCallback((value: string) => {
    const same = isSameRef.current ? isSameRef.current(value, savedRef.current) : value === savedRef.current
    update(same ? savedRef.current : value)
  }, [update])

  // 編集を始めるたびに、保存済みの値で始めて復元を判定し直す
  React.useEffect(() => {
    if (!active) return
    decidedRef.current = false
    touchedRef.current = false
    valueRef.current = savedRef.current
    setDraftState(savedRef.current)
    setRestored(null)
  }, [active, key])

  React.useEffect(() => {
    if (!active || !store.loaded || decidedRef.current) return
    decidedRef.current = true
    if (touchedRef.current) {
      // 読み取りを待つ間に入力があった: 入力を優先して残す
      push(valueRef.current)
      return
    }
    const entry = storedRef.current
    if (entry) {
      valueRef.current = entry.value
      setDraftState(entry.value)
      setRestored({ baseChanged: entry.base !== savedRef.current })
    }
  }, [active, store.loaded, key, push])

  // 編集中に保存済みの値が変わったとき（保存の反映など）、入力が未編集の間だけ追従する。編集済みの入力は保つ
  const prevSavedRef = React.useRef(savedValue)
  React.useEffect(() => {
    const previous = prevSavedRef.current
    prevSavedRef.current = savedValue
    if (!active || !decidedRef.current || previous === savedValue) return
    if (valueRef.current === previous) {
      valueRef.current = savedValue
      setDraftState(savedValue)
    }
  }, [active, savedValue])

  // 編集を閉じるとき（保存・キャンセル以外の閉じ方も含む）、保留中の書き込みを書き切る
  React.useEffect(() => {
    if (!active) return
    return () => flush()
  }, [active, flush])

  const setDraft = React.useCallback((value: string) => {
    valueRef.current = value
    if (!decidedRef.current) touchedRef.current = true
    setDraftState(value)
    push(value)
  }, [push])

  const discard = React.useCallback(() => {
    clear()
    setRestored(null)
    valueRef.current = savedRef.current
    setDraftState(savedRef.current)
  }, [clear])

  const finish = discard

  return { draft, setDraft, restored, hasDraft: store.stored !== null, discard, finish }
}
