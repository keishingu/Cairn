import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')) as {
  expo: { ios: { bundleIdentifier: string; icon: string; infoPlist: Record<string, unknown> } }
}
const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8')) as {
  build: { production: { autoIncrement: boolean; environment: string; channel: string } }
  submit: { production: { ios: { metadataPath: string } } }
}
const mobilePackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> }
const store = JSON.parse(
  readFileSync(new URL('../store.config.json', import.meta.url), 'utf8'),
) as {
  apple: {
    info: { ja: { title: string; privacyPolicyUrl: string; supportUrl: string } }
    release: { automaticRelease: boolean }
  }
}
const workflow = readFileSync(new URL('../.eas/workflows/submit-ios.yml', import.meta.url), 'utf8')

describe('iOS App Store申請設定', () => {
  it('本番Bundle IDと非透過用iOSアイコンを使う', () => {
    expect(app.expo.ios.bundleIdentifier).toBe('com.oss-cairn')
    expect(app.expo.ios.icon).toBe('./assets/icon-ios.png')
    expect(app.expo.ios.infoPlist['ITSAppUsesNonExemptEncryption']).toBe(false)
  })

  it('production buildを自動採番して同名のsubmit profileへ渡せる', () => {
    expect(eas.build.production).toMatchObject({
      autoIncrement: true,
      environment: 'production',
      channel: 'production',
    })
    expect(eas.submit.production.ios.metadataPath).toBe('./store.config.json')
    expect(mobilePackage.scripts['release:testflight:ios']).toContain('--auto-submit')
  })

  it('公開法務ページとサポートURLを日本語メタデータへ設定する', () => {
    expect(store.apple.info.ja).toMatchObject({
      title: 'Cairn',
      privacyPolicyUrl: 'https://oss-cairn.com/privacy',
      supportUrl: 'https://github.com/keishingu/Cairn/issues',
    })
    expect(store.apple.release.automaticRelease).toBe(false)
  })

  it('手動workflowでproduction buildをTestFlightへ送る', () => {
    expect(workflow).toContain('workflow_dispatch: {}')
    expect(workflow).toContain('profile: production')
    expect(workflow).toContain('type: testflight')
    expect(workflow).toContain('build_id: ${{ needs.build_ios.outputs.build_id }}')
  })
})
