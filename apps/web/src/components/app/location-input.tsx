'use client'

// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { Icon } from './primitives'

export interface PlaceSuggestion {
  placeId: string
  description: string
  mainText?: string
  secondaryText?: string
}

interface LocationInputProps {
  value: string
  onSelect: (description: string, placeId: string) => void
  onClear: () => void
  inputStyle: React.CSSProperties
  placeholder?: string
}

export function LocationInput({
  value,
  onSelect,
  onClear,
  inputStyle,
  placeholder = '例: 穂高連峰、北アルプス',
}: LocationInputProps) {
  const [inputValue, setInputValue] = React.useState(value)
  const [suggestions, setSuggestions] = React.useState<PlaceSuggestion[]>([])
  const [isOpen, setIsOpen] = React.useState(false)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => { setInputValue(value) }, [value])

  const fetchSuggestions = React.useCallback(async (input: string) => {
    if (input.length < 2) { setSuggestions([]); setIsOpen(false); return }
    try {
      const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(input)}`)
      if (!res.ok) return
      const data = await res.json() as PlaceSuggestion[]
      setSuggestions(data)
      setIsOpen(data.length > 0)
    } catch { /* ignore */ }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInputValue(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) { setSuggestions([]); setIsOpen(false); return }
    debounceRef.current = setTimeout(() => { void fetchSuggestions(val) }, 350)
  }

  const handleSelect = (s: PlaceSuggestion) => {
    setInputValue(s.description)
    setSuggestions([])
    setIsOpen(false)
    onSelect(s.description, s.placeId)
  }

  const handleClear = () => {
    setInputValue('')
    setSuggestions([])
    setIsOpen(false)
    onClear()
  }

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={inputValue}
          onChange={handleChange}
          onFocus={() => { if (suggestions.length > 0) setIsOpen(true) }}
          placeholder={placeholder}
          style={{ ...inputStyle, paddingLeft: 34, paddingRight: inputValue ? 30 : 12 }}
          autoComplete="off"
        />
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none', display: 'flex' }}>
          <Icon name="map-pin" size={14}/>
        </span>
        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              width: 16, height: 16, borderRadius: '50%',
              border: 'none', background: 'var(--border-2)', color: 'var(--text-3)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}
          >
            <Icon name="close" size={9}/>
          </button>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          marginTop: 4, borderRadius: 10,
          background: 'var(--card)', border: '1px solid var(--border)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
          overflow: 'hidden',
        }}>
          {suggestions.map((s, i) => (
            <button
              key={s.placeId}
              type="button"
              onClick={() => handleSelect(s)}
              style={{
                width: '100%', padding: '9px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
                border: 'none',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--divider)' : 'none',
                background: 'transparent', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <span style={{ color: 'var(--text-4)', flexShrink: 0, display: 'flex' }}>
                <Icon name="map-pin" size={13}/>
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.mainText ?? s.description}
                </span>
                {s.secondaryText && (
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.secondaryText}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
