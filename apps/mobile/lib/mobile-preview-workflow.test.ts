import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  new URL('../../../.github/workflows/mobile-preview.yml', import.meta.url),
  'utf8',
)
const require = createRequire(import.meta.url)
const { findEarlierActiveRuns } = require('../../../.github/scripts/mobile-preview-queue.cjs') as {
  findEarlierActiveRuns: (
    runs: Array<{
      id: number
      run_number: number
      event: string
      status: string
      run_started_at?: string
      created_at?: string
    }>,
    currentRunId: number,
  ) => Array<{ id: number; run_number: number }>
}

describe('モバイルプレビューの環境同期', () => {
  it('PRの接続先をEAS preview環境へ作成または上書きする', () => {
    expect(workflow).toContain('group: mobile-preview-pr-${{ github.event.pull_request.number }}')
    expect(workflow).toContain('cancel-in-progress: true')
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

  it('異なるPRの実行をEAS同期前にFIFOで待機させる', () => {
    expect(workflow).toContain('actions: read')
    expect(workflow).toContain('Wait for earlier Mobile Preview runs')
    expect(workflow).toContain('findEarlierActiveRuns')
    expect(workflow).not.toContain('group: mobile-preview-eas-environment')
  })
})

describe('モバイルプレビューのFIFOキュー', () => {
  it('開始時刻が早い未完了PRだけを待機対象にする', () => {
    const earlierRuns = findEarlierActiveRuns(
      [
        {
          id: 30,
          run_number: 30,
          event: 'pull_request',
          status: 'in_progress',
          run_started_at: '2026-07-20T03:00:00Z',
        },
        {
          id: 10,
          run_number: 10,
          event: 'pull_request',
          status: 'completed',
          run_started_at: '2026-07-20T01:00:00Z',
        },
        {
          id: 20,
          run_number: 20,
          event: 'pull_request',
          status: 'in_progress',
          run_started_at: '2026-07-20T02:00:00Z',
        },
        {
          id: 15,
          run_number: 15,
          event: 'push',
          status: 'in_progress',
          run_started_at: '2026-07-20T01:30:00Z',
        },
      ],
      30,
    )

    expect(earlierRuns.map((run) => run.id)).toEqual([20])
  })

  it('同じ開始時刻ではrun IDが小さい実行を先にする', () => {
    const earlierRuns = findEarlierActiveRuns(
      [
        {
          id: 42,
          run_number: 42,
          event: 'pull_request',
          status: 'queued',
          run_started_at: '2026-07-20T03:00:00Z',
        },
        {
          id: 41,
          run_number: 41,
          event: 'pull_request',
          status: 'in_progress',
          run_started_at: '2026-07-20T03:00:00Z',
        },
      ],
      42,
    )

    expect(earlierRuns.map((run) => run.id)).toEqual([41])
  })

  it('現在の実行がAPIに未反映なら待機を継続できるエラーにする', () => {
    expect(() => findEarlierActiveRuns([], 99)).toThrow(
      'Current workflow run 99 is not visible in the Actions API yet',
    )
  })
})
