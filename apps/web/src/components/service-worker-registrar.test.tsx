import { describe, expect, test } from 'vitest'
import { serviceWorkerUrl } from './service-worker-registrar'

describe('serviceWorkerUrl', () => {
  test('本番ではキャッシュを使う通常の Service Worker を登録する', () => {
    expect(serviceWorkerUrl('production')).toBe('/sw.js')
  })

  test('開発時はキャッシュを使わないモードの Service Worker を登録する', () => {
    expect(serviceWorkerUrl('development')).toBe('/sw.js?dev=1')
  })

  test('テスト環境なども本番以外はキャッシュを使わない', () => {
    expect(serviceWorkerUrl('test')).toBe('/sw.js?dev=1')
    expect(serviceWorkerUrl(undefined)).toBe('/sw.js?dev=1')
  })
})
