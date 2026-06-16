'use client'

import React from 'react'

const PHOTO_IDS = [
  '1464822759023-fed622ff2c3b', '1483728642387-6c3bdd6c93e5', '1454391304352-2bf4678b1a7a',
  '1519681393784-d120267933ba', '1486870591958-9b9d0d1dda99', '1454496522488-7a8e488e8606',
  '1469854523086-cc02fe5d8800', '1426604966848-d7adac402bff', '1418065460487-3956c3a83d04',
  '1551632811-561732d1e306',    '1506905925346-21bda4d32df4', '1444930694458-01babe71870e',
  '1502082553048-f009c37129b9', '1601925240970-98447a0e0cb0', '1542202229-7d93c33f5d07',
  '1464822759023-fed622ff2c3b', '1543946207-39bd91e70ca7', '1496614932623-0a3a9743552e',
  '1517524008697-84bbe3c3fd98', '1483356046701-7565d31be5c5',
]

const photoUrl = (idx: number, w = 600, h = 400) => {
  const id = PHOTO_IDS[Math.abs(idx) % PHOTO_IDS.length]
  return `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&auto=format&q=70`
}

// ─── Icon ─────────────────────────────────────────────────────────
interface IconProps {
  name: string
  size?: number
  color?: string
  strokeWidth?: number
  style?: React.CSSProperties
}

const PATHS: Record<string, React.ReactNode> = {
  home:        <><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></>,
  calendar:    <><rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M3 9h18"/><path d="M8 2.5v4M16 2.5v4"/></>,
  kanban:      <><rect x="3" y="3" width="6" height="14" rx="1.5"/><rect x="11" y="3" width="6" height="10" rx="1.5"/><rect x="15" y="3" width="6" height="18" rx="1.5"/></>,
  check:       <><polyline points="20 6 9 17 4 12"/></>,
  chat:        <><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/></>,
  file:        <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/></>,
  'file-text': <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></>,
  users:       <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  userPlus:    <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></>,
  settings:    <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
  sparkles:    <><path d="M12 3l1.7 4.5L18 9l-4.3 1.5L12 15l-1.7-4.5L6 9l4.3-1.5z"/><path d="M19 14l.8 2 2 .8-2 .8L19 19l-.8-2-2-.8 2-.8z"/><path d="M5 4l.6 1.5L7 6l-1.4.5L5 8l-.6-1.5L3 6l1.4-.5z"/></>,
  image:       <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 15l-5-5L5 21"/></>,
  inbox:       <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-6z"/></>,
  plus:        <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  search:      <><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></>,
  bell:        <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>,
  'bell-off':  <><path d="M13.7 21a2 2 0 0 1-3.4 0"/><path d="M10.7 3.1a6 6 0 0 1 7.2 5c0 2.5-.5 4.2-1.1 5.5"/><path d="M6 9c0 2-.5 3.8-1 5"/><path d="M3 3l18 18"/><path d="M9 9a6 6 0 0 0-.4 2.1"/><path d="M3 9h1"/><path d="M21 12h-1"/></>,
  chevDown:    <><polyline points="6 9 12 15 18 9"/></>,
  chevRight:   <><polyline points="9 6 15 12 9 18"/></>,
  chevLeft:    <><polyline points="15 6 9 12 15 18"/></>,
  chevronsLeft:  <><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></>,
  chevronsRight: <><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></>,
  close:       <><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></>,
  more:        <><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></>,
  filter:      <><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5"/></>,
  paperclip:   <><path d="M21 11l-9.5 9.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-9.5 9.5a2 2 0 0 1-3-3L15 7"/></>,
  smile:       <><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></>,
  send:        <><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
  heart:       <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
  pin:         <><path d="M12 17v5"/><path d="M9 11l-3 3h12l-3-3V3H9z"/></>,
  flag:        <><path d="M4 21V4h14l-3 5 3 5H4"/></>,
  arrowUp:     <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>,
  mountain:    <><path d="M3 20l6-9 4 6 3-4 5 7z"/><circle cx="9" cy="6" r="1.5"/></>,
  folder:      <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>,
  download:    <><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></>,
  edit:        <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
  grip:        <><circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/></>,
  arrowRight:  <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
  star:        <><polygon points="12 2 15.1 8.6 22 9.6 17 14.5 18.2 21.5 12 18.2 5.8 21.5 7 14.5 2 9.6 8.9 8.6"/></>,
  clock:       <><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></>,
  archive:     <><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><line x1="10" y1="13" x2="14" y2="13"/></>,
  eye:         <><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></>,
  'eye-off':   <><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.6 21.6 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a21.6 21.6 0 0 1-2.61 3.69M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>,
  moon:        <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></>,
  sun:         <><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/></>,
  book:        <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5V4.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/></>,
  list:        <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></>,
  layers:      <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
  lock:        <><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>,
  hash:        <><line x1="5" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="19" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></>,
  tent:        <><path d="M3 20l9-15 9 15z"/><path d="M12 5v15"/><path d="M9 20l3-4 3 4"/></>,
  mic:         <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 12a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/></>,
  map:         <><polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21"/><line x1="8" y1="3" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="21"/></>,
  'map-pin':   <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></>,
  logout:      <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
  monitor:     <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></>,
  refresh:     <><polyline points="23 4 23 10 17 10"/><path d="M20.5 16a9 9 0 1 1-2.5-9.4L23 10"/></>,
  database:    <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>,
  code:        <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></>,
  copy:        <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  trash:       <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
  link:        <><path d="M10 13a5 5 0 0 0 7.5.7l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.7l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></>,
  flask:       <><path d="M9 2v6L4 19a2 2 0 0 0 1.8 3h12.4a2 2 0 0 0 1.8-3L15 8V2"/><path d="M8.5 2h7"/><path d="M6.5 14h11"/></>,
  alertTriangle: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  reply:       <><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></>,
  bookmark:    <><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></>,
}

export const Icon = ({ name, size = 18, color = 'currentColor', strokeWidth = 1.7, style }: IconProps) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, color, flexShrink: 0, ...style }}
  >
    {PATHS[name] ?? null}
  </svg>
)

// ─── Avatar ───────────────────────────────────────────────────────
const AV_GRADS = [
  ['#34D399', '#10B981'],
  ['#60A5FA', '#3B82F6'],
  ['#F59E0B', '#F97316'],
  ['#F472B6', '#EC4899'],
  ['#A78BFA', '#7C3AED'],
  ['#FB7185', '#E11D48'],
  ['#22D3EE', '#0891B2'],
  ['#FBBF24', '#D97706'],
]
function hashName(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

interface AvatarProps {
  name?: string
  url?: string | null
  size?: number
  ring?: boolean
  style?: React.CSSProperties
}

export const Avatar = ({ name = '', url, size = 28, ring = false, style }: AvatarProps) => {
  const initials = name ? name.replace(/\s/g, '').slice(0, 1).toUpperCase() : '?'
  const g = AV_GRADS[hashName(name) % AV_GRADS.length]!
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: ring ? '0 0 0 2px var(--card)' : 'none',
    flexShrink: 0, overflow: 'hidden',
    ...style,
  }
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name} style={{ ...base, objectFit: 'cover' }}/>
    )
  }
  return (
    <div style={{
      ...base,
      background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
      color: '#fff', fontWeight: 600, fontSize: size * 0.42,
    }}>{initials}</div>
  )
}

interface AvatarStackProps {
  names?: string[]
  urls?: (string | null)[]
  size?: number
  max?: number
}

export const AvatarStack = ({ names = [], urls = [], size = 24, max = 4 }: AvatarStackProps) => {
  const shown = names.slice(0, max)
  const extra = names.length - shown.length
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      {shown.map((n, i) => (
        <div key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.32 }}>
          <Avatar name={n} url={urls[i] ?? null} size={size} ring />
        </div>
      ))}
      {extra > 0 && (
        <div style={{
          marginLeft: -size * 0.32,
          width: size, height: size, borderRadius: '50%',
          background: 'var(--bg-elev)', color: 'var(--text-3)',
          fontSize: size * 0.38, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 2px var(--card)',
        }}>+{extra}</div>
      )}
    </div>
  )
}

// ─── Status chip ──────────────────────────────────────────────────
interface StatusChipProps {
  name: string
  color: string
  size?: number
}

export const StatusChip = ({ name, color, size = 11 }: StatusChipProps) => (
  <span className="chip" style={{ background: color + '22', color: 'var(--text)', fontSize: size }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }}/>
    {name}
  </span>
)

// ─── Unread badge ─────────────────────────────────────────────────
// 未読件数バッジ。ヘッダーのベル・サイドバー・チャンネル一覧・通知パネルで
// 形・色・サイズを揃えるための共通コンポーネント。0 件では何も描画しない。
interface UnreadBadgeProps {
  count: number
  /** これを超える件数は `${max}+` 表記にする */
  max?: number
  /** sm: アイコン重ね用の小サイズ / md: 行内の標準サイズ */
  size?: 'sm' | 'md'
  /** 絶対配置・枠線などの位置調整を呼び出し側から渡す */
  style?: React.CSSProperties
}

export const UnreadBadge = ({ count, max = 99, size = 'md', style }: UnreadBadgeProps) => {
  if (count <= 0) return null
  const sm = size === 'sm'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      height: sm ? 16 : 18, minWidth: sm ? 16 : 18, padding: '0 5px',
      borderRadius: 999, boxSizing: 'border-box', lineHeight: 1,
      background: 'var(--accent)', color: 'var(--on-accent)',
      fontSize: sm ? 10 : 11, fontWeight: 700,
      ...style,
    }}>
      {count > max ? `${max}+` : count}
    </span>
  )
}

// ─── Mountain photo ───────────────────────────────────────────────
interface MountainPhotoProps {
  idx?: number
  height?: number
  flat?: boolean
  radius?: number | string
}

export const MountainPhoto = ({ idx = 0, height = 200, flat = false, radius }: MountainPhotoProps) => (
  <div style={{
    width: '100%', height,
    backgroundImage: `url("${photoUrl(idx, 800, Math.round(height * 1.6))}")`,
    backgroundSize: 'cover', backgroundPosition: 'center',
    borderRadius: radius != null ? radius : (flat ? 0 : '10px 10px 0 0'),
    backgroundColor: '#1f2937',
  }}/>
)

// ─── TopBar search box ────────────────────────────────────────────
export const TopBarSearch = ({ value, onChange, placeholder = '検索…' }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card-2)', border: `1px solid ${value ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '0 10px', height: 32, width: 260, transition: 'border-color .12s' }}>
    <Icon name="search" size={14} color={value ? 'var(--accent)' : 'var(--text-3)'}/>
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ flex: 1, fontSize: 12.5, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', caretColor: 'var(--accent)' }}
      onKeyDown={e => { if (e.key === 'Escape') onChange('') }}
    />
    {value && (
      <button onClick={() => onChange('')} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--text-4)' }}>
        <Icon name="close" size={12}/>
      </button>
    )}
  </div>
)

// ─── Placeholder page ─────────────────────────────────────────────
export const PlaceholderPage = ({ name, icon }: { name: string; icon: string }) => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
    <div style={{ maxWidth: 360, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <Icon name={icon} size={26}/>
      </div>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700 }}>{name}</h2>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
        このセクションはサイドバーから他のページへ移動できることを示すプレースホルダーです。実装時にはここに専用のビューが表示されます。
      </p>
    </div>
  </div>
)

// ─── Modal ────────────────────────────────────────────────────────
export const Modal = ({ onClose, children }: { onClose: () => void; children: React.ReactNode }) => {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--overlay)' }} onClick={onClose}/>
      {children}
    </div>
  )
}

export const ModalHeader = ({ icon, title, subtitle, onClose }: {
  icon?: string; title: string; subtitle?: string; onClose: () => void
}) => (
  <header style={{ padding: '16px 20px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12 }}>
    {icon && (
      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={16}/>
      </div>
    )}
    <div style={{ flex: 1, minWidth: 0 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
      {subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>{subtitle}</div>}
    </div>
    <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--card-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon name="close" size={16}/>
    </button>
  </header>
)

// ─── Form field ───────────────────────────────────────────────────
interface FieldProps {
  label: string; hint?: string; required?: boolean; error?: string | undefined
  children: React.ReactNode; htmlFor?: string
}

export const Field = ({ label, hint, required, error, children, htmlFor }: FieldProps) => (
  <label htmlFor={htmlFor} style={{ display: 'block' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.01em' }}>
        {label}
        {required && <span style={{ color: 'var(--red)', marginLeft: 4 }}>*</span>}
      </span>
      {hint && <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{hint}</span>}
    </div>
    {children}
    {error && (
      <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--red-text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 13, height: 13, borderRadius: '50%', background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>!</span>
        {error}
      </div>
    )}
  </label>
)

export function fieldInputStyle(invalid: boolean): React.CSSProperties {
  return {
    width: '100%', height: 36, padding: '0 12px',
    border: `1px solid ${invalid ? 'var(--red)' : 'var(--border)'}`,
    borderRadius: 8, background: 'var(--card)', color: 'var(--text)',
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
    transition: 'border-color .12s, box-shadow .12s',
    boxSizing: 'border-box',
  }
}

export function fieldTextareaStyle(invalid: boolean): React.CSSProperties {
  return { ...fieldInputStyle(invalid), height: 'auto', padding: '10px 12px', resize: 'vertical' as const, lineHeight: 1.55, minHeight: 80 }
}

export function onFocusRing(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--accent)'
  e.currentTarget.style.boxShadow = 'var(--ring)'
}

export function onBlurRing(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>, invalid: boolean) {
  e.currentTarget.style.borderColor = invalid ? 'var(--red)' : 'var(--border)'
  e.currentTarget.style.boxShadow = 'none'
}

// ─── FAB（モバイルの新規作成ボタン）──────────────────────────────
// ボトムナビの上・右下固定。モバイルのページ主要作成アクションはこれに統一する
export const Fab = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button
    onClick={onClick}
    aria-label={label}
    style={{
      position: 'fixed',
      right: 16,
      bottom: 'calc(80px + env(safe-area-inset-bottom) + 16px)',
      width: 52, height: 52, borderRadius: '50%',
      background: 'var(--accent)', color: 'var(--on-accent)',
      border: 'none', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      zIndex: 50,
    }}
  >
    <Icon name="plus" size={22}/>
  </button>
)

// ─── Typing dots animation ────────────────────────────────────────
export const TypingDots = () => (
  <span style={{ display: 'inline-flex', gap: 3 }}>
    {[0, 1, 2].map(i => (
      <span key={i} style={{
        width: 5, height: 5, borderRadius: '50%', background: 'var(--text-3)',
        animation: `typingPulse 1.2s ${i * 0.15}s ease-in-out infinite`,
      }}/>
    ))}
  </span>
)
