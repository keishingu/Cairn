// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

describe('/ai横断調査とAI PMO・課金の分離', () => {
  test.each([
    'src/lib/ai/workspace-research.ts',
    'src/lib/ai/workspace-research-directory.ts',
    'src/lib/files/read-file-content.ts',
  ])('調査問い合わせ層（%s）はPMO状態・通知・課金台帳を書き換えない', (path) => {
    const source = readFileSync(path, 'utf8')
    for (const forbidden of [
      'aiNudges',
      'aiScanStates',
      'notifications',
      'creditLedger',
      '.insert(',
      '.update(',
      '.delete(',
    ]) {
      expect(source).not.toContain(forbidden)
    }
  })

  test('リスク候補の事前取得は実際に検出対象となる期限条件だけを含める', () => {
    const source = readFileSync('src/lib/ai/workspace-research.ts', 'utf8')

    expect(source).toContain('lt(tasks.dueDate, today)')
    expect(source).toContain("eq(tasks.status, 'todo')")
    expect(source).toContain('gte(tasks.dueDate, today)')
    expect(source).toContain('criticalOverdueBefore')
    expect(source).toContain("\${tasks.status} = 'in_progress'")
    expect(source).toContain("\${tasks.priority} = 'high' and \${tasks.assigneeId} is null")
  })

  test('経歴のフィルタ指定とチャンネル名指定は、一覧と同じ権限確認済みの経路でだけ対象を決める', () => {
    const source = readFileSync('src/lib/ai/workspace-research-directory.ts', 'utf8')

    // list_members と経歴フィルタが同じ可視範囲（ゲスト範囲・活性のみ）を共有する
    expect(source.match(/loadVisibleResearchMembers\(/g)?.length).toBeGreaterThanOrEqual(3)
    expect(source).toContain('includeInactive: false')
    // プロジェクト役割の一致はゲストの参加プロジェクトに限る
    expect(source).toContain('scope.guestProjectIds ? inArray(projects.id, scope.guestProjectIds)')
    // チャンネル名は権限確認済みの非DM一覧からだけ解決し、DB を直接名前検索しない
    const resolver = source.slice(source.indexOf('async function resolveReadableChannel'), source.indexOf('export async function readResearchChannelMessages'))
    expect(resolver).toContain('loadAccessibleChannels(ctx, scope, {})')
    expect(resolver).not.toContain("from('channels')")
  })
})
