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
    return (
      <img
        src={`/api/attachments/${fileId}`}
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
