import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  new URL('../../../.github/workflows/mobile-preview.yml', import.meta.url),
  'utf8',
)
const mobilePackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { dependencies: Record<string, string> }
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
  it('PR作成時と権限者からの明示コメント時だけ起動する', () => {
    expect(workflow).toContain('types: [opened]')
    expect(workflow).toContain('issue_comment:')
    expect(workflow).toContain("github.event.comment.body == '@eas update'")
    expect(workflow).toContain('["OWNER","MEMBER","COLLABORATOR"]')
    expect(workflow).not.toContain('synchronize')
    expect(workflow).toContain('Resolve trusted PR head')
    expect(workflow).toContain('Reply with EAS Preview')
  })

  it('PRの接続先をEAS preview環境へ作成または上書きする', () => {
    expect(workflow).toContain(
      '    concurrency:\n      group: mobile-preview-pr-${{ github.event.pull_request.number || github.event.issue.number }}',
    )
    expect(workflow).not.toContain('\nconcurrency:\n')
    expect(workflow).toContain('cancel-in-progress: true')
    expect(workflow).toContain('--name EXPO_PUBLIC_API_BASE_URL')
    expect(workflow).toContain('--name EXPO_PUBLIC_SUPABASE_URL')
    expect(workflow).toContain('--name EXPO_PUBLIC_SUPABASE_ANON_KEY')
    expect(workflow).toContain('--name EXPO_PUBLIC_CAIRN_DEPLOYMENT_ENV')
    expect(workflow.match(/eas env:set preview/g)).toHaveLength(4)
    expect(workflow).not.toContain('eas env:create')
  })

  it('EAS UpdateをDevelopment BuildとInternal Distributionへ配信する', () => {
    expect(workflow).not.toContain('qr-target:')
    expect(mobilePackage.dependencies['expo-dev-client']).toBeDefined()
    expect(workflow).toContain('--environment preview')
    expect(workflow).toContain('--branch pr-${{ steps.pr.outputs.number }}')
    expect(workflow).toContain('Publish Internal Distribution EAS Update')
    expect(workflow).toContain('--channel preview')
    expect(workflow).toContain('EXPO_PUBLIC_CAIRN_DEPLOYMENT_ENV: preview')
    expect(workflow).toContain('ref: ${{ steps.pr.outputs.sha }}')
  })

  it('Vercel認証を避けるため初回から固定のdevelop Web APIを利用する', () => {
    expect(workflow).toContain('MOBILE_PREVIEW_API_BASE_URL: https://develop.oss-cairn.com')
    expect(workflow).not.toContain('github.rest.repos.listDeployments')
    expect(workflow).not.toContain('steps.web-api-base.outputs.url')
    expect(workflow).not.toContain('deployments: read')
  })

  it('異なるPRの実行をEAS同期前にFIFOで待機させる', () => {
    expect(workflow).toContain('actions: read')
    expect(workflow).toContain('Wait for earlier Mobile Preview runs')
    expect(workflow).toContain('findEarlierActiveRuns')
    expect(workflow).toContain('ref: ${{ github.workflow_sha }}')
    expect(workflow).toContain('path: trusted-mobile-preview')
    expect(workflow).toContain('trusted-mobile-preview/.github/scripts/mobile-preview-queue.cjs')
    expect(workflow).not.toContain('group: mobile-preview-eas-environment')
  })
})

describe('モバイルプレビューのFIFOキュー', () => {
  it('開始時刻が早い未完了Preview実行だけを待機対象にする', () => {
    const earlierRuns = findEarlierActiveRuns(
      [
        {
          id: 30,
          run_number: 30,
          event: 'issue_comment',
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
          id: 25,
          run_number: 25,
          event: 'issue_comment',
          status: 'queued',
          run_started_at: '2026-07-20T02:30:00Z',
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

    expect(earlierRuns.map((run) => run.id)).toEqual([20, 25])
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
