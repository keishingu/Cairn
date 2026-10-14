export const TASK_TITLE_MAX_LENGTH = 200

export type MessageTaskCandidate = { title: string; isListItem: boolean; taskId: string | null }
export type MessageTaskRow = { title: string; selected: boolean; taskId: string | null }

/** 初期選択: 未作成のリスト項目すべて。無ければ未作成の先頭1件。 */
export function initialMessageTaskRows(candidates: MessageTaskCandidate[]): MessageTaskRow[] {
  const hasOpenListItem = candidates.some((c) => c.isListItem && !c.taskId)
  const firstOpenIndex = candidates.findIndex((c) => !c.taskId)
  return candidates.map((candidate, index) => ({
    title: candidate.title,
    taskId: candidate.taskId,
    selected: !candidate.taskId && (hasOpenListItem ? candidate.isListItem : index === firstOpenIndex),
  }))
}

export function isValidTaskTitle(title: string): boolean {
  const trimmed = title.trim()
  return trimmed.length > 0 && Array.from(trimmed).length <= TASK_TITLE_MAX_LENGTH
}

/** 選択された行から送信するタイトルを作る（trim・重複排除）。 */
export function selectedTaskTitles(rows: MessageTaskRow[]): string[] {
  return [...new Set(rows.filter((row) => row.selected).map((row) => row.title.trim()))]
}
