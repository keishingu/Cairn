import React from 'react'
import { AppState } from 'react-native'
import * as Updates from 'expo-updates'
import { decideOtaForegroundAction, holdOtaReload, isOtaReloadHeld } from '../lib/ota-foreground-update'

/**
 * 前面へ戻ったとき、ダウンロード済みの EAS Update を適用する（十分長く裏にいて、失われる作業がないときだけ）。
 * 更新が無ければ取りに行き、次の前面復帰かコールドスタートで適用する。ログインの内外をまたぐルートに置く
 */
export function useOtaForegroundUpdate() {
  const { isUpdatePending } = Updates.useUpdates()
  const pendingRef = React.useRef(isUpdatePending)
  pendingRef.current = isUpdatePending

  React.useEffect(() => {
    if (!Updates.isEnabled) return
    let backgroundedAt: number | null = null
    let lastCheckedAt: number | null = null
    let busy = false
    let previous = AppState.currentState

    const sub = AppState.addEventListener('change', (next) => {
      const wasActive = previous === 'active'
      previous = next
      if (next !== 'active') {
        if (wasActive) backgroundedAt = Date.now()
        return
      }
      if (wasActive || busy) return

      const now = Date.now()
      const action = decideOtaForegroundAction({
        enabled: Updates.isEnabled,
        updatePending: pendingRef.current,
        backgroundedAt,
        lastCheckedAt,
        held: isOtaReloadHeld(),
        now,
      })
      if (action === 'none') return

      busy = true
      void (async () => {
        try {
          if (action === 'reload') {
            await Updates.reloadAsync()
            return
          }
          lastCheckedAt = now
          const result = await Updates.checkForUpdateAsync()
          // 配信の取り下げ（埋め込み版へのロールバック）も fetch で取り込まないと、裏で保持され続ける端末に届かない。
          // 適用は次の前面復帰かコールドスタート。今は操作を始めた直後なので再読み込みしない
          if (result.isAvailable || result.isRollBackToEmbedded) await Updates.fetchUpdateAsync()
        } catch (error) {
          // 取得できなくても今の版で動き続けられる。次の前面復帰で再試行する
          console.warn('[Updates] 前面復帰時の更新の確認・適用に失敗しました:', error instanceof Error ? error.message : error)
        } finally {
          busy = false
        }
      })()
    })
    return () => sub.remove()
  }, [])
}

/** 再読み込みで失われる作業（未送信の下書き・アップロード中の添付）がある間、前面復帰時の適用を止める */
export function useHoldOtaReload(hold: boolean) {
  React.useEffect(() => {
    if (!hold) return
    return holdOtaReload()
  }, [hold])
}
