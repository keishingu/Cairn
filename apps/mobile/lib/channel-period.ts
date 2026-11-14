const formatTime = (time: string | null | undefined) => (time ? time.slice(0, 5) : null)

// Webのチャット一覧と同じく、date列をUTC変換せず月/日で短く表示する。
export function formatChannelPeriod(
  start: string | null,
  end: string | null,
  startTime?: string | null,
  endTime?: string | null,
): string | undefined {
  const formatDate = (iso: string) => {
    const [, month, day] = iso.slice(0, 10).split('-').map(Number)
    return `${month}/${day}`
  }
  const formattedStartTime = formatTime(startTime)
  const formattedEndTime = formatTime(endTime)

  if (start && end) {
    const startLabel = `${formatDate(start)}${formattedStartTime ? ` ${formattedStartTime}` : ''}`
    const endLabel = `${end === start ? '' : formatDate(end)}${
      formattedEndTime ? `${end === start ? '' : ' '}${formattedEndTime}` : ''
    }`
    return endLabel ? `${startLabel}〜${endLabel}` : startLabel
  }
  if (end) return `〜${formatDate(end)}${formattedEndTime ? ` ${formattedEndTime}` : ''}`
  if (start) return `${formatDate(start)}${formattedStartTime ? ` ${formattedStartTime}` : ''}〜`
  return undefined
}
