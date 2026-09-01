// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export function ProfileAttributeBadges({
  attributes,
  compact = false,
}: {
  attributes: string[]
  compact?: boolean
}) {
  if (attributes.length === 0) return null

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {attributes.map(attribute => (
        <span
          key={attribute}
          style={{
            padding: compact ? '1px 6px' : '2px 8px',
            borderRadius: 4,
            background: 'var(--card-2)',
            color: 'var(--text-3)',
            fontSize: compact ? 10 : 10.5,
            fontWeight: 600,
            lineHeight: 1.4,
            overflowWrap: 'anywhere',
          }}
        >
          {attribute}
        </span>
      ))}
    </span>
  )
}
