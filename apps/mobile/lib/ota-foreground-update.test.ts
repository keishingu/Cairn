// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import {
  OTA_CHECK_MIN_INTERVAL_MS,
  OTA_RELOAD_MIN_BACKGROUND_MS,
  decideOtaForegroundAction,
  holdOtaReload,
  isOtaReloadHeld,
  type OtaForegroundState,
} from './ota-foreground-update'

const NOW = 1_800_000_000_000

function state(overrides: Partial<OtaForegroundState> = {}): OtaForegroundState {
  return {
    enabled: true,
    updatePending: false,
    backgroundedAt: NOW - OTA_RELOAD_MIN_BACKGROUND_MS,
    lastCheckedAt: null,
    held: false,
    now: NOW,
    ...overrides,
  }
}

describe('前面復帰時の更新の判定', () => {
  it('ダウンロード済みの更新があり十分長く裏にいたら再読み込みで適用する', () => {
    expect(decideOtaForegroundAction(state({ updatePending: true }))).toBe('reload')
  })

  it('写真の選択や共有から短時間で戻ったときは再読み込みしない', () => {
    expect(decideOtaForegroundAction(state({
      updatePending: true,
      backgroundedAt: NOW - OTA_RELOAD_MIN_BACKGROUND_MS + 1,
    }))).toBe('none')
  })

  it('未送信の入力やアップロード中の添付がある間は再読み込みしない', () => {
    expect(decideOtaForegroundAction(state({ updatePending: true, held: true }))).toBe('none')
  })

  it('裏へ回った時刻が分からなければ再読み込みしない', () => {
    expect(decideOtaForegroundAction(state({ updatePending: true, backgroundedAt: null }))).toBe('none')
  })

  it('更新が無ければ確認しに行き、間隔内の再確認はしない', () => {
    expect(decideOtaForegroundAction(state())).toBe('check')
    expect(decideOtaForegroundAction(state({ lastCheckedAt: NOW - OTA_CHECK_MIN_INTERVAL_MS + 1 }))).toBe('none')
    expect(decideOtaForegroundAction(state({ lastCheckedAt: NOW - OTA_CHECK_MIN_INTERVAL_MS }))).toBe('check')
  })

  it('expo-updates が無効な開発ビルドでは何もしない', () => {
    expect(decideOtaForegroundAction(state({ enabled: false, updatePending: true }))).toBe('none')
  })
})

describe('再読み込みの保留', () => {
  it('保留した画面がすべて外すまで保留を続ける', () => {
    const releaseFirst = holdOtaReload()
    const releaseSecond = holdOtaReload()
    expect(isOtaReloadHeld()).toBe(true)
    releaseFirst()
    releaseFirst()
    expect(isOtaReloadHeld()).toBe(true)
    releaseSecond()
    expect(isOtaReloadHeld()).toBe(false)
  })
})
