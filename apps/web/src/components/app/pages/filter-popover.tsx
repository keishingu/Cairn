'use client'

import React from 'react'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'

export interface FilterPopoverProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  allStatuses: ProjectStatusDto[]
  selected: string[]
  onChange: (statuses: string[]) => void
  allMembers?: string[]
  selectedMembers?: string[]
  onChangeMembers?: (members: string[]) => void
  onClose: () => void
}

const checkRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
}

export const FilterPopover = ({
  containerRef, allStatuses, selected, onChange,
  allMembers = [], selectedMembers = [], onChangeMembers,
  onClose,
}: FilterPopoverProps) => {
  const ref = React.useRef<HTMLDivElement>(null)
  const totalItems = allStatuses.length + allMembers.length
  const [focusIndex, setFocusIndex] = React.useState(0)

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        containerRef.current && !containerRef.current.contains(e.target as Node)
      ) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [containerRef, onClose])

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown') {
        e.preventDefault()
        setFocusIndex(prev => Math.min(prev + 1, totalItems - 1))
      } else if (e.code === 'ArrowUp') {
        e.preventDefault()
        setFocusIndex(prev => Math.max(prev - 1, 0))
      } else if (e.code === 'Space') {
        e.preventDefault()
        if (focusIndex < allStatuses.length) {
          const name = allStatuses[focusIndex]!.name
          toggleStatus(name)
        } else {
          const name = allMembers[focusIndex - allStatuses.length]!
          toggleMember(name)
        }
      } else if (e.code === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusIndex, allStatuses, allMembers, totalItems, onClose])

  const toggleStatus = (name: string) =>
    onChange(selected.includes(name) ? selected.filter(x => x !== name) : [...selected, name])

  const toggleMember = (name: string) =>
    onChangeMembers?.(selectedMembers.includes(name) ? selectedMembers.filter(x => x !== name) : [...selectedMembers, name])

  const hasAny = selected.length > 0 || selectedMembers.length > 0

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, marginTop: 4,
      width: 240, background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 200, padding: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        ステータス
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {allStatuses.map((s, i) => {
          const isChecked = selected.includes(s.name)
          const focused = i === focusIndex
          return (
            <label
              key={s.id}
              style={{ ...checkRowStyle, background: focused ? 'var(--card-hover)' : 'transparent' }}
              onMouseEnter={e => { if (!focused) (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
              onMouseLeave={e => { if (!focused) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleStatus(s.name)}
                style={{ width: 14, height: 14, accentColor: s.color, cursor: 'pointer' }}
              />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{s.name}</span>
            </label>
          )
        })}
      </div>

      {allMembers.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, marginTop: 12 }}>
            参加者
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {allMembers.map((name, i) => {
              const isChecked = selectedMembers.includes(name)
              const focused = (i + allStatuses.length) === focusIndex
              return (
                <label
                  key={name}
                  style={{ ...checkRowStyle, background: focused ? 'var(--card-hover)' : 'transparent' }}
                  onMouseEnter={e => { if (!focused) (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
                  onMouseLeave={e => { if (!focused) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleMember(name)}
                    style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'var(--accent-soft)', color: 'var(--accent)',
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {name.charAt(0)}
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{name}</span>
                </label>
              )
            })}
          </div>
        </>
      )}

      {hasAny && (
        <button onClick={() => { onChange([]); onChangeMembers?.([]) }} style={{
          marginTop: 10, width: '100%', padding: '7px 0',
          border: '1px solid var(--border)', borderRadius: 6,
          background: 'transparent', color: 'var(--text-3)',
          fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          すべてクリア
        </button>
      )}
    </div>
  )
}
