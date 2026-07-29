import type { AccentId } from '@cairn/shared'

type BasePalette = {
  bg: string
  card: string
  card2: string
  cardHover: string
  border: string
  divider: string
  text: string
  text2: string
  text3: string
  text4: string
  redText: string
}

type AccentPalette = {
  accent: string
  accentSoft: string
  accentText: string
  onAccent: string
}

export type ThemePalette = BasePalette & AccentPalette
export type ResolvedTheme = 'light' | 'dark'

const BASE: Record<ResolvedTheme, BasePalette> = {
  light: {
    bg: '#F8FAFC',
    card: '#FFFFFF',
    card2: '#F8FAFC',
    cardHover: '#F1F5F9',
    border: '#E2E8F0',
    divider: '#EEF2F7',
    text: '#0F172A',
    text2: '#334155',
    text3: '#64748B',
    text4: '#94A3B8',
    redText: '#B91C1C',
  },
  dark: {
    bg: '#0B0F14',
    card: '#111827',
    card2: '#0F1622',
    cardHover: '#1A2233',
    border: '#1F2937',
    divider: '#1A2030',
    text: '#F9FAFB',
    text2: '#D1D5DB',
    text3: '#9CA3AF',
    text4: '#6B7280',
    redText: '#F87171',
  },
}

// Web の ACCENT_PRESETS と同じトークン。ネイティブで使う4色だけを保持する。
const ACCENTS: Record<AccentId, Record<ResolvedTheme, AccentPalette>> = {
  emerald: {
    light: { accent: '#10B981', accentSoft: '#ECFDF5', accentText: '#047857', onAccent: '#FFFFFF' },
    dark: {
      accent: '#10B981',
      accentSoft: 'rgba(16, 185, 129, 0.12)',
      accentText: '#34D399',
      onAccent: '#06241A',
    },
  },
  blue: {
    light: { accent: '#3B82F6', accentSoft: '#EFF6FF', accentText: '#1D4ED8', onAccent: '#FFFFFF' },
    dark: {
      accent: '#60A5FA',
      accentSoft: 'rgba(59, 130, 246, 0.12)',
      accentText: '#93C5FD',
      onAccent: '#0A1930',
    },
  },
  violet: {
    light: { accent: '#8B5CF6', accentSoft: '#F5F3FF', accentText: '#6D28D9', onAccent: '#FFFFFF' },
    dark: {
      accent: '#A78BFA',
      accentSoft: 'rgba(139, 92, 246, 0.12)',
      accentText: '#C4B5FD',
      onAccent: '#1A0F3A',
    },
  },
  rose: {
    light: { accent: '#F43F5E', accentSoft: '#FFF1F2', accentText: '#BE123C', onAccent: '#FFFFFF' },
    dark: {
      accent: '#FB7185',
      accentSoft: 'rgba(244, 63, 94, 0.12)',
      accentText: '#FDA4AF',
      onAccent: '#2D0714',
    },
  },
  pink: {
    light: { accent: '#EC4899', accentSoft: '#FDF2F8', accentText: '#9D174D', onAccent: '#FFFFFF' },
    dark: {
      accent: '#F472B6',
      accentSoft: 'rgba(236, 72, 153, 0.12)',
      accentText: '#F9A8D4',
      onAccent: '#2D0A1E',
    },
  },
  amber: {
    light: { accent: '#F59E0B', accentSoft: '#FFFBEB', accentText: '#B45309', onAccent: '#FFFFFF' },
    dark: {
      accent: '#FBBF24',
      accentSoft: 'rgba(245, 158, 11, 0.12)',
      accentText: '#FCD34D',
      onAccent: '#2D1A00',
    },
  },
  cyan: {
    light: { accent: '#06B6D4', accentSoft: '#ECFEFF', accentText: '#0E7490', onAccent: '#FFFFFF' },
    dark: {
      accent: '#22D3EE',
      accentSoft: 'rgba(6, 182, 212, 0.12)',
      accentText: '#67E8F9',
      onAccent: '#031A20',
    },
  },
}

export function createThemePalette(theme: ResolvedTheme, accentId: AccentId): ThemePalette {
  return { ...BASE[theme], ...ACCENTS[accentId][theme] }
}

export const THEME: Record<ResolvedTheme, ThemePalette> = {
  light: createThemePalette('light', 'emerald'),
  dark: createThemePalette('dark', 'emerald'),
}
