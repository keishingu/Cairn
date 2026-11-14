// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import type { ToolInvocation } from 'ai'
import { pendingActionIdsFromTools } from './ai-pending-action-card'

describe('承認カードを出す実行案の抽出', () => {
  test('作成に成功したpropose_* toolの結果だけを拾う', () => {
    const invocations = [
      { state: 'result', toolCallId: '1', toolName: 'propose_post_message', args: {}, result: { ok: true, pendingAction: { id: 'a1' } } },
      { state: 'result', toolCallId: '2', toolName: 'propose_create_task', args: {}, result: { ok: false, error: { code: 'INVALID_PROPOSAL' } } },
      { state: 'result', toolCallId: '3', toolName: 'list_projects', args: {}, result: { ok: true, pendingAction: { id: 'x' } } },
      { state: 'call', toolCallId: '4', toolName: 'propose_post_message', args: {} },
    ] as ToolInvocation[]
    expect(pendingActionIdsFromTools(invocations)).toEqual(['a1'])
  })
})
