// Web 側 apps/web/src/app/globals.css のカラートークンと揃える（ライト / ダーク）。
// ネイティブ画面と WebView 画面の見た目を統一するため、値を変える場合は globals.css と同期すること
export const THEME = {
  light: {
    bg: '#F8FAFC',
    card: '#FFFFFF',
    card2: '#F8FAFC',
    cardHover: '#F1F5F9',
    border: '#E2E8F0',
    border2: '#CBD5E1',
    divider: '#EEF2F7',
    text: '#0F172A',
    text2: '#334155',
    text3: '#64748B',
    text4: '#94A3B8',
    accent: '#10B981',
    accentSoft: '#ECFDF5',
    accentText: '#047857',
    onAccent: '#FFFFFF',
    red: '#EF4444',
    redText: '#B91C1C',
  },
  dark: {
    bg: '#0B0F14',
    card: '#111827',
    card2: '#0F1622',
    cardHover: '#1A2233',
    border: '#1F2937',
    border2: '#374151',
    divider: '#1A2030',
    text: '#F9FAFB',
    text2: '#D1D5DB',
    text3: '#9CA3AF',
    text4: '#6B7280',
    accent: '#10B981',
    accentSoft: 'rgba(16,185,129,0.12)',
    accentText: '#34D399',
    onAccent: '#06241A',
    red: '#EF4444',
    redText: '#F87171',
  },
}

export type Theme = typeof THEME.light
