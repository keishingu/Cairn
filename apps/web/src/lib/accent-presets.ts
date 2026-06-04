// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export type AccentColors = {
  accent: string
  accentHover: string
  accentSoft: string
  accentSoft2: string
  accentText: string
  onAccent: string
  selection: string
  ring: string
}

export type AccentPreset = {
  id: string
  label: string
  swatch: string
  light: AccentColors
  dark: AccentColors
}

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'emerald',
    label: 'エメラルド',
    swatch: '#10B981',
    light: {
      accent:      '#10B981',
      accentHover: '#059669',
      accentSoft:  '#ECFDF5',
      accentSoft2: '#D1FAE5',
      accentText:  '#047857',
      onAccent:    '#FFFFFF',
      selection:   '#C7F0DC',
      ring:        '0 0 0 3px rgba(16,185,129,0.20)',
    },
    dark: {
      accent:      '#10B981',
      accentHover: '#34D399',
      accentSoft:  'rgba(16,185,129,0.12)',
      accentSoft2: 'rgba(16,185,129,0.20)',
      accentText:  '#34D399',
      onAccent:    '#06241A',
      selection:   'rgba(16,185,129,0.25)',
      ring:        '0 0 0 3px rgba(16,185,129,0.32)',
    },
  },
  {
    id: 'blue',
    label: 'ブルー',
    swatch: '#3B82F6',
    light: {
      accent:      '#3B82F6',
      accentHover: '#2563EB',
      accentSoft:  '#EFF6FF',
      accentSoft2: '#DBEAFE',
      accentText:  '#1D4ED8',
      onAccent:    '#FFFFFF',
      selection:   '#BFDBFE',
      ring:        '0 0 0 3px rgba(59,130,246,0.20)',
    },
    dark: {
      accent:      '#60A5FA',
      accentHover: '#93C5FD',
      accentSoft:  'rgba(59,130,246,0.12)',
      accentSoft2: 'rgba(59,130,246,0.20)',
      accentText:  '#93C5FD',
      onAccent:    '#0A1930',
      selection:   'rgba(59,130,246,0.25)',
      ring:        '0 0 0 3px rgba(59,130,246,0.32)',
    },
  },
  {
    id: 'violet',
    label: 'バイオレット',
    swatch: '#8B5CF6',
    light: {
      accent:      '#8B5CF6',
      accentHover: '#7C3AED',
      accentSoft:  '#F5F3FF',
      accentSoft2: '#EDE9FE',
      accentText:  '#6D28D9',
      onAccent:    '#FFFFFF',
      selection:   '#DDD6FE',
      ring:        '0 0 0 3px rgba(139,92,246,0.20)',
    },
    dark: {
      accent:      '#A78BFA',
      accentHover: '#C4B5FD',
      accentSoft:  'rgba(139,92,246,0.12)',
      accentSoft2: 'rgba(139,92,246,0.20)',
      accentText:  '#C4B5FD',
      onAccent:    '#1A0F3A',
      selection:   'rgba(139,92,246,0.25)',
      ring:        '0 0 0 3px rgba(139,92,246,0.32)',
    },
  },
  {
    id: 'rose',
    label: 'ローズ',
    swatch: '#F43F5E',
    light: {
      accent:      '#F43F5E',
      accentHover: '#E11D48',
      accentSoft:  '#FFF1F2',
      accentSoft2: '#FFE4E6',
      accentText:  '#BE123C',
      onAccent:    '#FFFFFF',
      selection:   '#FECDD3',
      ring:        '0 0 0 3px rgba(244,63,94,0.20)',
    },
    dark: {
      accent:      '#FB7185',
      accentHover: '#FDA4AF',
      accentSoft:  'rgba(244,63,94,0.12)',
      accentSoft2: 'rgba(244,63,94,0.20)',
      accentText:  '#FDA4AF',
      onAccent:    '#2D0714',
      selection:   'rgba(244,63,94,0.25)',
      ring:        '0 0 0 3px rgba(244,63,94,0.32)',
    },
  },
  {
    id: 'pink',
    label: 'ピンク',
    swatch: '#EC4899',
    light: {
      accent:      '#EC4899',
      accentHover: '#DB2777',
      accentSoft:  '#FDF2F8',
      accentSoft2: '#FCE7F3',
      accentText:  '#9D174D',
      onAccent:    '#FFFFFF',
      selection:   '#FBCFE8',
      ring:        '0 0 0 3px rgba(236,72,153,0.20)',
    },
    dark: {
      accent:      '#F472B6',
      accentHover: '#F9A8D4',
      accentSoft:  'rgba(236,72,153,0.12)',
      accentSoft2: 'rgba(236,72,153,0.20)',
      accentText:  '#F9A8D4',
      onAccent:    '#2D0A1E',
      selection:   'rgba(236,72,153,0.25)',
      ring:        '0 0 0 3px rgba(236,72,153,0.32)',
    },
  },
  {
    id: 'amber',
    label: 'アンバー',
    swatch: '#F59E0B',
    light: {
      accent:      '#F59E0B',
      accentHover: '#D97706',
      accentSoft:  '#FFFBEB',
      accentSoft2: '#FEF3C7',
      accentText:  '#B45309',
      onAccent:    '#FFFFFF',
      selection:   '#FDE68A',
      ring:        '0 0 0 3px rgba(245,158,11,0.20)',
    },
    dark: {
      accent:      '#FBBF24',
      accentHover: '#FCD34D',
      accentSoft:  'rgba(245,158,11,0.12)',
      accentSoft2: 'rgba(245,158,11,0.20)',
      accentText:  '#FCD34D',
      onAccent:    '#2D1A00',
      selection:   'rgba(245,158,11,0.25)',
      ring:        '0 0 0 3px rgba(245,158,11,0.32)',
    },
  },
  {
    id: 'cyan',
    label: 'シアン',
    swatch: '#06B6D4',
    light: {
      accent:      '#06B6D4',
      accentHover: '#0891B2',
      accentSoft:  '#ECFEFF',
      accentSoft2: '#CFFAFE',
      accentText:  '#0E7490',
      onAccent:    '#FFFFFF',
      selection:   '#A5F3FC',
      ring:        '0 0 0 3px rgba(6,182,212,0.20)',
    },
    dark: {
      accent:      '#22D3EE',
      accentHover: '#67E8F9',
      accentSoft:  'rgba(6,182,212,0.12)',
      accentSoft2: 'rgba(6,182,212,0.20)',
      accentText:  '#67E8F9',
      onAccent:    '#031A20',
      selection:   'rgba(6,182,212,0.25)',
      ring:        '0 0 0 3px rgba(6,182,212,0.32)',
    },
  },
]

export const DEFAULT_ACCENT_ID = 'emerald'
export const ACCENT_STORAGE_KEY = 'cairn:accent'
