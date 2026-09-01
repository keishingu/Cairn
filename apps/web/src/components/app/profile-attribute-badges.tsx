// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { ProfileAttributeColor, ProfileAttributeDto } from '@cairn/shared'

export const PROFILE_ATTRIBUTE_COLOR_OPTIONS: Array<{
  id: ProfileAttributeColor
  label: string
  background: string
  text: string
  swatch: string
}> = [
  { id: 'slate', label: 'グレー', background: 'var(--card-2)', text: 'var(--text-3)', swatch: 'var(--text-3)' },
  { id: 'blue', label: 'ブルー', background: 'var(--blue-soft)', text: 'var(--blue-text)', swatch: 'var(--blue)' },
  { id: 'emerald', label: 'グリーン', background: 'var(--emerald-soft)', text: 'var(--emerald-text)', swatch: 'var(--emerald)' },
  { id: 'amber', label: 'イエロー', background: 'var(--amber-soft)', text: 'var(--amber-text)', swatch: 'var(--amber)' },
  { id: 'violet', label: 'パープル', background: 'var(--violet-soft)', text: 'var(--violet-text)', swatch: 'var(--violet)' },
  { id: 'rose', label: 'レッド', background: 'var(--rose-soft)', text: 'var(--rose-text)', swatch: 'var(--rose)' },
]

const COLOR_STYLES = Object.fromEntries(
  PROFILE_ATTRIBUTE_COLOR_OPTIONS.map(option => [option.id, option]),
) as Record<ProfileAttributeColor, (typeof PROFILE_ATTRIBUTE_COLOR_OPTIONS)[number]>

export function ProfileAttributeBadges({
  attributes,
  compact = false,
}: {
  attributes: ProfileAttributeDto[]
  compact?: boolean
}) {
  if (attributes.length === 0) return null

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {attributes.map(attribute => {
        const color = COLOR_STYLES[attribute.color]
        return (
          <span
            key={attribute.id}
            style={{
              padding: compact ? '1px 6px' : '2px 8px',
              borderRadius: 4,
              background: color.background,
              color: color.text,
              fontSize: compact ? 10 : 10.5,
              fontWeight: 600,
              lineHeight: 1.4,
              overflowWrap: 'anywhere',
            }}
          >
            {attribute.name}
          </span>
        )
      })}
    </span>
  )
}
