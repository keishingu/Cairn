'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'
import { useT } from '@/components/locale-provider'
import { portalHostFor } from '../primitives'

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
  const didInitialFocus = React.useRef(false)
  const [position, setPosition] = React.useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null)

  React.useLayoutEffect(() => {
    const updatePosition = () => {
      const anchor = containerRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const below = Math.max(0, window.innerHeight - rect.bottom - 12)
      const above = Math.max(0, rect.top - 12)
      const openAbove = below < 360 && above > below
      const maxHeight = Math.min(480, openAbove ? above : below)
      const width = Math.max(0, Math.min(240, window.innerWidth - 16))
      const maxLeft = Math.max(0, window.innerWidth - width - 8)
      setPosition({
        left: Math.max(Math.min(8, maxLeft), Math.min(rect.right - width, maxLeft)),
        width,
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
    if (!position || didInitialFocus.current) return
    didInitialFocus.current = true
    const firstControl = ref.current?.querySelector<HTMLElement>('input[type="checkbox"], button')
    if (firstControl) firstControl.focus()
    else ref.current?.focus()
  }, [position])

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

  const toggleStatus = (name: string) =>
    onChange(selected.includes(name) ? selected.filter(x => x !== name) : [...selected, name])

  const toggleMember = (name: string) =>
    onChangeMembers?.(selectedMembers.includes(name) ? selectedMembers.filter(x => x !== name) : [...selectedMembers, name])

  const hasAny = selected.length > 0 || selectedMembers.length > 0

  if (typeof document === 'undefined') return null
  const portalHost = portalHostFor(containerRef.current)
  if (!portalHost) return null
  const popoverWidth = position?.width ?? 0

  return createPortal((
    <div ref={ref} className="app" style={{
      position: 'fixed', left: position?.left ?? 0,
      ...(position?.bottom !== undefined ? { bottom: position.bottom } : { top: position?.top ?? 0 }),
      width: popoverWidth, boxSizing: 'border-box', background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 'var(--z-popover)', padding: 12,
      maxHeight: position?.maxHeight ?? 0, overflowY: 'auto', visibility: position ? 'visible' : 'hidden',
    }} tabIndex={-1}
      onKeyDown={event => {
        if (event.code === 'Escape') {
          event.preventDefault()
          containerRef.current?.querySelector('button')?.focus()
          onClose()
          return
        }
        if (event.code !== 'ArrowDown' && event.code !== 'ArrowUp') return
        const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>('input[type="checkbox"], button') ?? [])
        const currentIndex = controls.indexOf(event.target as HTMLElement)
        if (currentIndex < 0) return
        event.preventDefault()
        const nextIndex = event.code === 'ArrowDown'
          ? Math.min(currentIndex + 1, controls.length - 1)
          : Math.max(currentIndex - 1, 0)
        controls[nextIndex]?.focus()
        controls[nextIndex]?.scrollIntoView?.({ block: 'nearest' })
      }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        {t('Status')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {allStatuses.map(s => {
          const isChecked = selected.includes(s.name)
          return (
            <label
              key={s.id}
              style={checkRowStyle}
              className="hover-bg"
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
            {allMembers.map(name => {
              const isChecked = selectedMembers.includes(name)
              return (
                <label
                  key={name}
                  style={checkRowStyle}
                  className="hover-bg"
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
        <button onClick={() => {
          const firstCheckbox = ref.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')
          if (firstCheckbox) firstCheckbox.focus()
          else ref.current?.focus()
          onChange([])
          onChangeMembers?.([])
        }} className="btn btn-sm btn-block" style={{ marginTop: 10 }}>
          {t('Clear all')}
        </button>
      )}
    </div>
  ), portalHost)
}
