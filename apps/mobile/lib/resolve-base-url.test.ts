import { describe, expect, it } from 'vitest'
import { requireBaseUrl, resolveBaseUrl } from './resolve-base-url'

describe('モバイル接続先URLの解決', () => {
  it('環境変数のURLを優先して末尾のスラッシュを除く', () => {
    const result = resolveBaseUrl({
      name: 'EXPO_PUBLIC_API_BASE_URL',
      configuredUrl: 'https://preview.example.com/',
      development: true,
      hostUri: '192.168.1.10:8081',
      developmentPort: 3128,
    })

    expect(result).toEqual({
      ok: true,
      source: 'environment',
      url: 'https://preview.example.com',
    })
  })

  it('ローカル開発ではMetroホストから接続先を導出する', () => {
    const result = resolveBaseUrl({
      name: 'EXPO_PUBLIC_API_BASE_URL',
      configuredUrl: undefined,
      development: true,
      hostUri: '192.168.1.10:8081',
      developmentPort: 3128,
    })

    expect(result).toEqual({
      ok: true,
      source: 'metro',
      url: 'http://192.168.1.10:3128',
    })
  })

  it('IPv6のMetroホストをURLとして扱える', () => {
    const result = resolveBaseUrl({
      name: 'EXPO_PUBLIC_SUPABASE_URL',
      configuredUrl: undefined,
      development: true,
      hostUri: '[::1]:8081',
      developmentPort: 54321,
    })

    expect(result).toEqual({
      ok: true,
      source: 'metro',
      url: 'http://[::1]:54321',
    })
  })

  it('非開発環境で未設定ならEAS環境の確認を促す', () => {
    const result = resolveBaseUrl({
      name: 'EXPO_PUBLIC_API_BASE_URL',
      configuredUrl: undefined,
      development: false,
      hostUri: undefined,
      developmentPort: 3128,
    })

    expect(() => requireBaseUrl(result)).toThrow(
      'EXPO_PUBLIC_API_BASE_URL が設定されていません。EAS の対象環境を確認してください',
    )
  })

  it('http以外の環境変数を拒否する', () => {
    const result = resolveBaseUrl({
      name: 'EXPO_PUBLIC_API_BASE_URL',
      configuredUrl: 'file:///tmp/api',
      development: false,
      hostUri: undefined,
      developmentPort: 3128,
    })

    expect(result).toEqual({
      ok: false,
      message: 'EXPO_PUBLIC_API_BASE_URL には http または https の URL を設定してください',
    })
  })
})
