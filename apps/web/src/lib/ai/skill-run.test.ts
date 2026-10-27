// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest'

vi.mock('@cairn/db', () => ({ db: {} }))

describe('スキルの呼び出しの解釈', () => {
  test('先頭の $名前 と、その後ろの追加の依頼を切り出す', async () => {
    const { parseSkillInvocation } = await import('./skill-run')
    expect(parseSkillInvocation('$assign-reviewer 北アルプス縦走計画でお願い')).toEqual({
      name: 'assign-reviewer',
      request: '北アルプス縦走計画でお願い',
    })
    expect(parseSkillInvocation('  $assign-reviewer\n')).toEqual({ name: 'assign-reviewer', request: '' })
  })

  test('先頭以外の $ や、名前の形でないものはスキルとして扱わない', async () => {
    const { parseSkillInvocation } = await import('./skill-run')
    expect(parseSkillInvocation('費用は $100 です')).toBeNull()
    expect(parseSkillInvocation('$100 は予算です。計画を提案して')).toBeNull()
    expect(parseSkillInvocation('$1st-review')).toBeNull()
    expect(parseSkillInvocation('$Assign')).toBeNull()
    expect(parseSkillInvocation('$assign-reviewer:北アルプス')).toBeNull()
    expect(parseSkillInvocation('レビュワーを決めて $assign-reviewer')).toBeNull()
  })
})

describe('run に残す根拠の収集', () => {
  test('tool結果の中のevidenceを種類とIDで重複なく集める', async () => {
    const { collectEvidence } = await import('./skill-run')
    const evidence = { type: 'member', id: 'user-1', label: '鈴木 健', href: '/members/user-1' }
    expect(
      collectEvidence([
        { ok: true, items: [{ evidence: [evidence] }, { evidence: [evidence] }] },
        { ok: true, project: { evidence: { type: 'project', id: 'p1', label: '縦走', href: '/projects?open=project-p1' } } },
        { ok: false, error: { code: 'ACCESS_DENIED' } },
      ]),
    ).toEqual([
      { type: 'member', id: 'user-1', label: '鈴木 健' },
      { type: 'project', id: 'p1', label: '縦走' },
    ])
  })
})
