'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'
import { useT } from '@/components/locale-provider'

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
  const t = useT()
  const ref = React.useRef<HTMLDivElement>(null)
  const rowRefs = React.useRef<Array<HTMLLabelElement | null>>([])
  const [position, setPosition] = React.useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null)
  const totalItems = allStatuses.length + allMembers.length
  const [focusIndex, setFocusIndex] = React.useState(0)

  React.useLayoutEffect(() => {
    const updatePosition = () => {
      const anchor = containerRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const below = Math.max(0, window.innerHeight - rect.bottom - 12)
      const above = Math.max(0, rect.top - 12)
      const openAbove = below < 360 && above > below
      const maxHeight = Math.min(480, openAbove ? above : below)
      setPosition({
        left: Math.max(8, Math.min(rect.right - 240, window.innerWidth - 248)),
        ...(openAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
        maxHeight,
      })
    }
    const handleScroll = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) updatePosition()
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [containerRef])

  React.useEffect(() => {
    rowRefs.current[focusIndex]?.scrollIntoView?.({ block: 'nearest' })
  }, [focusIndex])

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
      if (e.code === 'Escape') { onClose(); return }
      if (totalItems === 0) return // 未ロード/0件のときは矢印・スペースを無視
      if (e.code === 'ArrowDown') {
        e.preventDefault()
        setFocusIndex(prev => Math.min(prev + 1, totalItems - 1))
      } else if (e.code === 'ArrowUp') {
        e.preventDefault()
        setFocusIndex(prev => Math.max(prev - 1, 0))
      } else if (e.code === 'Space') {
        e.preventDefault()
        if (focusIndex < 0) return // 未選択
        if (focusIndex < allStatuses.length) {
          toggleStatus(allStatuses[focusIndex]!.name)
        } else {
          toggleMember(allMembers[focusIndex - allStatuses.length]!)
        }
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

  if (typeof document === 'undefined') return null

  return createPortal((
    <div ref={ref} style={{
      position: 'fixed', left: position?.left ?? 0,
      ...(position?.bottom !== undefined ? { bottom: position.bottom } : { top: position?.top ?? 0 }),
      width: 240, background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 'var(--z-popover)', padding: 12,
      maxHeight: position?.maxHeight ?? 0, overflowY: 'auto', visibility: position ? 'visible' : 'hidden',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        {t('Status')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {allStatuses.map((s, i) => {
          const isChecked = selected.includes(s.name)
          const focused = i === focusIndex
          return (
            <label
              key={s.id}
              ref={element => { rowRefs.current[i] = element }}
              style={{ ...checkRowStyle, background: focused ? 'var(--card-hover)' : 'transparent' }}
              className={!focused ? 'hover-bg' : undefined}
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
            {t('Participants')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {allMembers.map((name, i) => {
              const isChecked = selectedMembers.includes(name)
              const focused = (i + allStatuses.length) === focusIndex
              return (
                <label
                  key={name}
                  ref={element => { rowRefs.current[allStatuses.length + i] = element }}
                  style={{ ...checkRowStyle, background: focused ? 'var(--card-hover)' : 'transparent' }}
                  className={!focused ? 'hover-bg' : undefined}
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
        <button onClick={() => { onChange([]); onChangeMembers?.([]) }} className="btn btn-sm btn-block" style={{ marginTop: 10 }}>
          {t('Clear all')}
        </button>
      )}
    </div>
  ), document.body)
}
