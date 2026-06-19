export function fileKindLabel(mimeType: string | null, fileName: string): string {
  if (mimeType === 'application/pdf') return 'PDF'
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  ) return 'XLS'
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) return 'DOC'
  if (mimeType?.startsWith('image/')) return 'IMG'
  const ext = fileName.split('.').pop()?.toUpperCase() ?? 'FILE'
  return ext.slice(0, 4)
}

function fileKindColor(kind: string): { bg: string; color: string } {
  if (kind === 'PDF') return { bg: 'var(--red-soft)', color: 'var(--red-text)' }
  if (kind === 'XLS') return { bg: 'var(--emerald-soft)', color: 'var(--emerald-text)' }
  if (kind === 'DOC') return { bg: 'var(--blue-soft)', color: 'var(--blue-text)' }
  if (kind === 'IMG') return { bg: 'var(--violet-soft)', color: 'var(--violet-text)' }
  return { bg: 'var(--card-2)', color: 'var(--text-3)' }
}

export function FileTypeIcon({
  mimeType,
  fileName,
  fileId,
  width = 32,
  height = 36,
}: {
  mimeType: string | null
  fileName: string
  fileId?: string
  width?: number
  height?: number
}) {
  if (mimeType?.startsWith('image/') && fileId) {
    // Retina 表示に耐える程度（表示辺の約3倍）の縮小版を要求する
    const reqWidth = Math.round(Math.max(width, height) * 3)
    return (
      <img
        src={`/api/attachments/${fileId}?w=${reqWidth}`}
        alt={fileName}
        style={{ width, height, borderRadius: 4, objectFit: 'cover', flexShrink: 0, display: 'block' }}
      />
    )
  }
  const kind = fileKindLabel(mimeType, fileName)
  const { bg, color } = fileKindColor(kind)
  return (
    <div style={{
      width, height, borderRadius: 4, flexShrink: 0,
      background: bg, color,
      fontSize: Math.round(height / 4), fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {kind}
    </div>
  )
}

// ─── Google Docs ──────────────────────────────────────────────────

const GDOC_CONFIG = {
  doc:   { label: 'GDoc', bg: 'var(--blue-soft)',    color: 'var(--blue-text)' },
  sheet: { label: 'GSht', bg: 'var(--emerald-soft)', color: 'var(--emerald-text)' },
  slide: { label: 'GSld', bg: 'var(--violet-soft)',  color: 'var(--violet-text)' },
  drive: { label: 'GDrv', bg: 'var(--card-2)',       color: 'var(--text-3)' },
} as const

export function googleDocsType(url: string): 'doc' | 'sheet' | 'slide' | 'drive' | null {
  if (url.includes('docs.google.com/document/')) return 'doc'
  if (url.includes('docs.google.com/spreadsheets/')) return 'sheet'
  if (url.includes('docs.google.com/presentation/')) return 'slide'
  if (url.includes('drive.google.com/file/')) return 'drive'
  return null
}

export function GoogleDocsIcon({ url, width = 32, height = 36 }: { url: string; width?: number; height?: number }) {
  const type = googleDocsType(url)
  const cfg = type ? GDOC_CONFIG[type] : { label: 'LINK', bg: 'var(--card-2)', color: 'var(--text-3)' }
  return (
    <div style={{
      width, height, borderRadius: 4, flexShrink: 0,
      background: cfg.bg, color: cfg.color,
      fontSize: 9, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {cfg.label}
    </div>
  )
}

// ─── IndexDot ─────────────────────────────────────────────────────

export function IndexDot({ status }: { status: string | undefined }) {
  if (!status) return null
  const bg =
    status === 'indexed' ? '#22c55e' :
    status === 'pending' ? '#f59e0b' :
    status === 'failed'  ? 'var(--red)' : null
  if (!bg) return null
  return (
    <span style={{
      position: 'absolute', bottom: -1, right: -2,
      width: 7, height: 7, borderRadius: '50%',
      background: bg, border: '1.5px solid var(--bg)',
      flexShrink: 0,
    }}/>
  )
}

