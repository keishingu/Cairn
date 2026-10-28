'use client'

// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { useT } from '@/components/locale-provider'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import { useAutomations } from '@/hooks/use-automations'

/** 入力が `$` と名前の途中だけのときに、その前方一致の名前を返す（スペースを打ったら候補を閉じる） */
export function skillQueryFromInput(input: string): string | null {
  const match = /^\s*\$((?:[a-z][a-z0-9-]*)?)$/.exec(input)
  return match ? match[1]! : null
}

/** AIアシスタントの入力欄で `$` を打ったときのスキルの候補。スキルを呼べるのは member 以上（ゲストには出さない） */
export function SkillSuggestions({ input, onSelect }: { input: string; onSelect: (name: string) => void }) {
  const t = useT()
  const { isMember } = useWorkspacePermissions()
  const query = skillQueryFromInput(input)
  const { data: automations = [], error } = useAutomations({ enabled: isMember && query !== null })
  if (query === null || !isMember) return null
  const skills = automations.filter(automation => automation.kind === 'skill' && automation.enabled && automation.name.startsWith(query))
  return (
    <div role="listbox" aria-label={t('Skills')} style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      {error ? (
        <div role="alert" style={{ padding: '8px 12px', fontSize: 12, color: 'var(--red-text)' }}>{error.message}</div>
      ) : skills.length === 0 ? (
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-4)' }}>{t('No matching skills. Admins can add skills in Settings > AI automations.')}</div>
      ) : skills.map(skill => (
        <button
          key={skill.id}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onSelect(skill.name)}
          className="hover-bg"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>${skill.name}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{skill.instruction}</span>
        </button>
      ))}
    </div>
  )
}
