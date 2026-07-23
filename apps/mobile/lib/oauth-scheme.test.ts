import { describe, expect, it } from 'vitest'
import { resolveOAuthScheme } from './oauth-scheme'

describe('OAuth callback scheme', () => {
  it('インストール済みiOS binaryのbundle IDからvariant固有schemeを決める', () => {
    expect(resolveOAuthScheme('com.oss-cairn.dev')).toBe('cairn-dev')
    expect(resolveOAuthScheme('com.oss-cairn.preview')).toBe('cairn-preview')
    expect(resolveOAuthScheme('com.oss-cairn')).toBe('cairn')
  })

  it('Android package IDも同じvariantへ対応させる', () => {
    expect(resolveOAuthScheme('com.oss_cairn.dev')).toBe('cairn-dev')
    expect(resolveOAuthScheme('com.oss_cairn.preview')).toBe('cairn-preview')
    expect(resolveOAuthScheme('com.oss_cairn')).toBe('cairn')
  })

  it('Expo Goや未知のapplication IDではproduction schemeへ安全にfallbackする', () => {
    expect(resolveOAuthScheme('host.exp.Exponent')).toBe('cairn')
    expect(resolveOAuthScheme(null)).toBe('cairn')
  })
})
