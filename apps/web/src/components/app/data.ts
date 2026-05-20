// Sample data for the mountain club SaaS prototype

export const MEMBERS = ['山田 太郎', '佐藤 花子', '鈴木 健', '田中 陽子', '伊藤 翔', '高橋 美咲', '中村 拓也', '小林 大地']

export interface Project {
  id: string
  name: string
  status: StatusKey
  dates: string
  startDate: string | null
  endDate: string | null
  members: number
  unread: number
  accent: string
  bg: string
}

export type StatusKey = 'plan' | 'review' | 'wait' | 'doing' | 'retro' | 'done'

export interface StatusConfig {
  label: string
  bg: string
  fg: string
  dot: string
}

export const STATUS: Record<StatusKey, StatusConfig> = {
  plan:   { label: '計画中',     bg: 'var(--blue-soft)',    fg: 'var(--blue-text)',    dot: 'var(--blue)' },
  review: { label: '審議中',     bg: 'var(--amber-soft)',   fg: 'var(--amber-text)',   dot: 'var(--amber)' },
  wait:   { label: '実施待ち',   bg: 'var(--emerald-soft)', fg: 'var(--emerald-text)', dot: 'var(--emerald)' },
  doing:  { label: '実施中',     bg: 'var(--violet-soft)',  fg: 'var(--violet-text)',  dot: 'var(--violet)' },
  retro:  { label: '振り返り中', bg: 'var(--rose-soft)',    fg: 'var(--rose-text)',    dot: 'var(--rose)' },
  done:   { label: '完了',       bg: 'var(--bg-elev)',      fg: 'var(--text-3)',       dot: 'var(--text-4)' },
}

export interface StatusColConfig {
  bg: string
  bar: string
  text: string
}

export const STATUS_COL: Record<StatusKey, StatusColConfig> = {
  plan:   { bg: 'var(--col-plan-bg)',   bar: 'var(--col-plan-bar)',   text: 'var(--blue-text)' },
  review: { bg: 'var(--col-review-bg)', bar: 'var(--col-review-bar)', text: 'var(--amber-text)' },
  wait:   { bg: 'var(--col-wait-bg)',   bar: 'var(--col-wait-bar)',   text: 'var(--emerald-text)' },
  doing:  { bg: 'var(--col-doing-bg)',  bar: 'var(--col-doing-bar)',  text: 'var(--violet-text)' },
  retro:  { bg: 'var(--col-retro-bg)',  bar: 'var(--col-retro-bar)',  text: 'var(--rose-text)' },
  done:   { bg: 'var(--col-done-bg)',   bar: 'var(--col-done-bar)',   text: 'var(--text-3)' },
}

export const PROJECTS: Project[] = [
  { id: 'p1', name: '北アルプス縦走計画', status: 'plan',   dates: '5/18–5/22', startDate: '2026-05-18', endDate: '2026-05-22', members: 8,  unread: 5, accent: 'var(--blue)',     bg: 'var(--col-plan-bg)' },
  { id: 'p2', name: '夏山合宿計画',       status: 'review', dates: '6/15–6/18', startDate: '2026-06-15', endDate: '2026-06-18', members: 10, unread: 7, accent: 'var(--amber)',   bg: 'var(--col-review-bg)' },
  { id: 'p3', name: 'クライミング講習会', status: 'review', dates: '5/25',      startDate: '2026-05-25', endDate: null,         members: 5,  unread: 2, accent: 'var(--amber)',   bg: 'var(--col-review-bg)' },
  { id: 'p4', name: '雪山訓練',           status: 'wait',   dates: '5/30–5/31', startDate: '2026-05-30', endDate: '2026-05-31', members: 6,  unread: 2, accent: 'var(--emerald)', bg: 'var(--col-wait-bg)' },
  { id: 'p5', name: '秋山ハイキング',     status: 'wait',   dates: '8/10',      startDate: '2026-08-10', endDate: null,         members: 4,  unread: 0, accent: 'var(--emerald)', bg: 'var(--col-wait-bg)' },
  { id: 'p6', name: '春山合宿',           status: 'doing',  dates: '5/10–5/12', startDate: '2026-05-10', endDate: '2026-05-12', members: 9,  unread: 4, accent: 'var(--violet)',  bg: 'var(--col-doing-bg)' },
  { id: 'p7', name: '沢登り練習会',       status: 'plan',   dates: '5/23',      startDate: '2026-05-23', endDate: null,         members: 6,  unread: 0, accent: 'var(--blue)',    bg: 'var(--col-plan-bg)' },
  { id: 'p8', name: '最終ハイキング',     status: 'retro',  dates: '4/25',      startDate: '2026-04-25', endDate: null,         members: 7,  unread: 0, accent: 'var(--rose)',    bg: 'var(--col-retro-bg)' },
]

export const PHOTO_IDS = [
  '1464822759023-fed622ff2c3b',
  '1483728642387-6c3bdd6c93e5',
  '1454391304352-2bf4678b1a7a',
  '1519681393784-d120267933ba',
  '1486870591958-9b9d0d1dda99',
  '1454496522488-7a8e488e8606',
  '1469854523086-cc02fe5d8800',
  '1426604966848-d7adac402bff',
  '1418065460487-3956c3a83d04',
  '1551632811-561732d1e306',
  '1506905925346-21bda4d32df4',
  '1444930694458-01babe71870e',
  '1502082553048-f009c37129b9',
  '1601925240970-98447a0e0cb0',
  '1542202229-7d93c33f5d07',
  '1464822759023-fed622ff2c3b',
  '1543946207-39bd91e70ca7',
  '1496614932623-0a3a9743552e',
  '1517524008697-84bbe3c3fd98',
  '1483356046701-7565d31be5c5',
]

export const photoUrl = (idx: number, w = 600, h = 400) => {
  const id = PHOTO_IDS[Math.abs(idx) % PHOTO_IDS.length]
  return `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&auto=format&q=70`
}
