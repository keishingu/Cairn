import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const workflow = readFileSync(
  new URL('../../../.github/workflows/mobile-production-update.yml', import.meta.url),
  'utf8',
)

describe('ストア版への自動 OTA 配信', () => {
  test('main へのモバイル関連の merge と手動実行だけで起動する', () => {
    expect(workflow).toContain('branches: [main]')
    expect(workflow).toContain("- 'apps/mobile/**'")
    expect(workflow).toContain("- 'packages/shared/**'")
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toContain('pull_request')
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'")
  })

  test('本番の EAS 環境から production チャンネルへ配信する', () => {
    expect(workflow).toContain('environment: production')
    expect(workflow).toContain('--channel production')
    expect(workflow).toContain('--environment production')
    expect(workflow).toContain('EXPO_PUBLIC_CAIRN_DEPLOYMENT_ENV: production')
    expect(workflow).not.toContain('eas env:set')
  })

  test('配信を直列化し、途中の配信を取り消さない', () => {
    expect(workflow).toContain('group: mobile-production-update')
    expect(workflow).toContain('cancel-in-progress: false')
  })

  test('本番の EXPO_TOKEN を扱うサードパーティの Action と EAS CLI はバージョンを固定する', () => {
    expect(workflow).toMatch(/pnpm\/action-setup@[0-9a-f]{40}/)
    expect(workflow).toMatch(/expo\/expo-github-action@[0-9a-f]{40}/)
    expect(workflow).not.toContain('eas-version: latest')
  })
})
