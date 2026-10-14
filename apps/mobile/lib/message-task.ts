export const TASK_TITLE_MAX_LENGTH = 200

export type MessageTaskCandidate = { line: string; title: string; isListItem: boolean; taskId: string | null }
export type MessageTaskRow = { line: string; title: string; selected: boolean; taskId: string | null }

/** 初期選択: 未作成のリスト項目すべて。無ければ未作成の先頭1件。 */
export function initialMessageTaskRows(candidates: MessageTaskCandidate[]): MessageTaskRow[] {
  const hasOpenListItem = candidates.some((c) => c.isListItem && !c.taskId)
  const firstOpenIndex = candidates.findIndex((c) => !c.taskId)
  return candidates.map((candidate, index) => ({
    line: candidate.line,
    title: candidate.title,
    taskId: candidate.taskId,
    selected: !candidate.taskId && (hasOpenListItem ? candidate.isListItem : index === firstOpenIndex),
  }))
}

export function isValidTaskTitle(title: string): boolean {
  const trimmed = title.trim()
  return trimmed.length > 0 && Array.from(trimmed).length <= TASK_TITLE_MAX_LENGTH
}

/** POST の失敗時に利用者へ見せる文言。サーバーの検証メッセージ（422 の error など）があればそのまま使う。 */
export function messageTaskErrorMessage(data: { error?: unknown } | null | undefined, fallback: string): string {
  return typeof data?.error === 'string' && data.error !== '' ? data.error : fallback
}

/** 送信する1件。line は候補の行そのまま（作成済み判定のキー）、title は編集後のタスク名。 */
export type MessageTaskSubmitItem = { line: string; title: string }

/** 選択された行から送信する項目を作る（title は trim。行ごとに1件）。 */
export function selectedTaskItems(rows: MessageTaskRow[]): MessageTaskSubmitItem[] {
  return rows.filter((row) => row.selected).map((row) => ({ line: row.line, title: row.title.trim() }))
}
