import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appConfig = readFileSync(new URL('../app.json', import.meta.url), 'utf8')
const easConfig = readFileSync(new URL('../eas.json', import.meta.url), 'utf8')
const mobilePackage = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
const workflow = readFileSync(
  new URL('../../../.github/workflows/mobile-internal-build.yml', import.meta.url),
  'utf8',
)

describe('モバイルInternal Distribution', () => {
  it('preview profileをInternal Distributionとpreview環境へ固定する', () => {
    const eas = JSON.parse(easConfig) as {
      build: { preview: { distribution: string; environment: string; channel: string } }
    }

    expect(eas.build.preview).toMatchObject({
      distribution: 'internal',
      environment: 'preview',
      channel: 'preview',
    })
  })

  it('手動workflowからplatformを選んで非対話buildを開始できる', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('eas build --platform "${{ inputs.platform }}"')
    expect(workflow).toContain('--profile preview --non-interactive --no-wait')
  })

  it('次のオフライン機能に必要なnative moduleとruntimeを含む', () => {
    const app = JSON.parse(appConfig) as {
      expo: { runtimeVersion: string; plugins: unknown[] }
    }
    const packageJson = JSON.parse(mobilePackage) as {
      dependencies: Record<string, string>
    }

    expect(packageJson.dependencies['expo-network']).toBe('~8.0.8')
    expect(packageJson.dependencies['expo-sqlite']).toBe('~16.0.10')
    expect(app.expo.runtimeVersion).toBe('1.1.0')
    expect(app.expo.plugins).toContainEqual(['expo-sqlite', { enableFTS: true }])
  })
})
