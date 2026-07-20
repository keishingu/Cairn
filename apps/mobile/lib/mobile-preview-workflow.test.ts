import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  new URL('../../../.github/workflows/mobile-preview.yml', import.meta.url),
  'utf8',
)

describe('モバイルプレビューの環境同期', () => {
  it('PRの接続先をEAS preview環境へ作成または上書きする', () => {
    expect(workflow).toContain('group: mobile-preview-eas-environment')
    expect(workflow).toContain('--name EXPO_PUBLIC_API_BASE_URL')
    expect(workflow).toContain('--name EXPO_PUBLIC_SUPABASE_URL')
    expect(workflow).toContain('--name EXPO_PUBLIC_SUPABASE_ANON_KEY')
    expect(workflow.match(/--force/g)).toHaveLength(3)
  })

  it('EAS Updateをpreview環境かつDevelopment Build向けに配信する', () => {
    expect(workflow).toContain('qr-target: dev-client')
    expect(workflow).toContain('--environment preview')
    expect(workflow).toContain('ref: ${{ github.event.pull_request.head.sha }}')
  })
})
