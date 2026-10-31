import { describe, expect, it } from 'vitest'
import { formatBuildInfo } from './build-info'

describe('ビルド情報の表記', () => {
  it('OTA で動いているときは Expo で検索できるよう ID の全体を出す', () => {
    expect(
      formatBuildInfo({
        version: '1.1.0',
        buildNumber: '42',
        runtimeVersion: '1.8.0',
        updateId: 'a24dff0b-0528-4c4c-90a6-0b0e2b0fb9e8',
        isEmbeddedLaunch: false,
      }),
    ).toBe('v1.1.0 (42) · runtime 1.8.0 · OTA a24dff0b-0528-4c4c-90a6-0b0e2b0fb9e8')
  })

  it('ビルド内蔵の JS で動いているときは ID があっても OTA と表示しない', () => {
    expect(
      formatBuildInfo({
        version: '1.1.0',
        buildNumber: '42',
        runtimeVersion: '1.8.0',
        updateId: 'a24dff0b-0528-4c4c-90a6-0b0e2b0fb9e8',
        isEmbeddedLaunch: true,
      }),
    ).toBe('v1.1.0 (42) · runtime 1.8.0 · embedded')
  })

  it('開発ビルドのように ID がなければビルド内蔵と分かるようにする', () => {
    expect(
      formatBuildInfo({
        version: '1.1.0',
        buildNumber: '42',
        runtimeVersion: '1.8.0',
        updateId: null,
        isEmbeddedLaunch: false,
      }),
    ).toBe('v1.1.0 (42) · runtime 1.8.0 · embedded')
  })

  it('取得できない項目は省く', () => {
    expect(
      formatBuildInfo({
        version: null,
        buildNumber: null,
        runtimeVersion: null,
        updateId: null,
        isEmbeddedLaunch: false,
      }),
    ).toBe('embedded')
  })
})
