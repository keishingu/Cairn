import { describe, expect, it } from 'vitest'
import { resolveOAuthScheme } from './oauth-scheme'

describe('OAuth callback scheme', () => {
  it('ネイティブ設定のvariant固有schemeを使う', () => {
    expect(resolveOAuthScheme('cairn-dev')).toBe('cairn-dev')
    expect(resolveOAuthScheme('cairn-preview')).toBe('cairn-preview')
  })

  it('配列設定と設定取得前のfallbackを扱う', () => {
    expect(resolveOAuthScheme(['cairn-preview', 'cairn'])).toBe('cairn-preview')
    expect(resolveOAuthScheme(undefined)).toBe('cairn')
  })
})
