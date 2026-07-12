// Web 側のカラートークンと同期する。ネイティブのポップアップと WebView の見た目を揃えるための最小テーマ。
export const THEME = {
  light: {
    card: '#FFFFFF',
    cardHover: '#F1F5F9',
    border: '#E2E8F0',
    divider: '#EEF2F7',
    text: '#0F172A',
    text3: '#64748B',
    accent: '#10B981',
    redText: '#B91C1C',
  },
  dark: {
    card: '#111827',
    cardHover: '#1A2233',
    border: '#1F2937',
    divider: '#1A2030',
    text: '#F9FAFB',
    text3: '#9CA3AF',
    accent: '#10B981',
    redText: '#F87171',
  },
} as const
