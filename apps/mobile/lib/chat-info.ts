type Translate = (message: string, values?: Record<string, string | number>) => string

// Postgres date 列の 'YYYY-MM-DD' を UTC 解釈せずローカル日付として扱う（Web のチャット詳細と同じ）
function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return `${year}/${month}/${day}`
}

export function formatProjectDateRange(start: string | null, end: string | null, t: Translate): string | null {
  if (!start && !end) return null
  if (start && end) return t('{start} – {end}', { start: formatDate(start), end: formatDate(end) })
  if (start) return t('{start} –', { start: formatDate(start) })
  return t('– {end}', { end: formatDate(end!) })
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function formatFileTimestamp(iso: string): string {
  const date = new Date(iso)
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// 未完了を上に、完了済みを下にまとめる。各グループ内の順序は保つ
export function sortTasksForChecklist<T extends { status: string }>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'))
}

export type ChatInfoKind = 'project' | 'dm' | 'channel'

export function chatInfoKind(channelType: string | undefined, projectId: string | undefined): ChatInfoKind {
  if (projectId) return 'project'
  return channelType === 'dm' ? 'dm' : 'channel'
}

// 公開チャンネルはメンバー欄を出さない（Web と同じ）
export function chatInfoMemberLabel(kind: ChatInfoKind, isPrivate: boolean, t: Translate): string | null {
  if (kind === 'project') return t('Project members')
  if (kind === 'dm') return t('Participants')
  return isPrivate ? t('Channel members') : null
}

// 色はワークスペースが決めた値。形式が想定外なら描画に渡さない
export function isHexColor(value: string | null | undefined): value is string {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value)
}
