// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// EAS Update は既定では起動時にダウンロードし、次のコールドスタートで適用する。iOS は
// アプリを裏で何日も保持するため、修正（例: Realtime の購読数の削減）が届かないまま古い JS が動き続ける。
// 前面へ戻ったときに、ダウンロード済みの更新を適用し、無ければ次回のために取りに行く。

/** この時間以上裏にいたときだけ再読み込みする。写真の選択・共有・ブラウザから戻った直後の再読み込みを避ける */
export const OTA_RELOAD_MIN_BACKGROUND_MS = 15 * 60 * 1000
/** 前面復帰ごとの更新確認の最小間隔。通信を増やさない */
export const OTA_CHECK_MIN_INTERVAL_MS = 30 * 60 * 1000

export type OtaForegroundAction = 'reload' | 'check' | 'none'

export interface OtaForegroundState {
  /** expo-updates が有効（開発ビルド・Expo Go では無効） */
  enabled: boolean
  /** ダウンロード済みで、再読み込みすると適用される更新がある */
  updatePending: boolean
  /** 直前に裏へ回った時刻。不明なら null */
  backgroundedAt: number | null
  /** 前回の更新確認の時刻。未確認なら null */
  lastCheckedAt: number | null
  /** 未送信の入力・アップロード中など、再読み込みで失われる作業がある */
  held: boolean
  now: number
}

/** 前面へ戻ったときに何をするか */
export function decideOtaForegroundAction(state: OtaForegroundState): OtaForegroundAction {
  if (!state.enabled) return 'none'
  if (state.updatePending) {
    const backgroundFor = state.backgroundedAt === null ? 0 : state.now - state.backgroundedAt
    if (!state.held && backgroundFor >= OTA_RELOAD_MIN_BACKGROUND_MS) return 'reload'
    // 保留中に確認し直しても同じ更新を取るだけなので、次の前面復帰を待つ
    return 'none'
  }
  if (state.lastCheckedAt !== null && state.now - state.lastCheckedAt < OTA_CHECK_MIN_INTERVAL_MS) return 'none'
  return 'check'
}

// 再読み込みで失われる作業（未送信の下書き・アップロード中の添付）を持つ画面が登録する
const holders = new Set<symbol>()

/** 戻り値の関数で登録を外す */
export function holdOtaReload(): () => void {
  const token = Symbol('ota-reload-hold')
  holders.add(token)
  return () => {
    holders.delete(token)
  }
}

export function isOtaReloadHeld(): boolean {
  return holders.size > 0
}
