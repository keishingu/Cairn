// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

describe('/ai横断調査とAI PMO・課金の分離', () => {
  test('調査問い合わせ層はPMO状態・通知・課金台帳を書き換えない', () => {
    const source = readFileSync('src/lib/ai/workspace-research.ts', 'utf8')
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
  })
})
