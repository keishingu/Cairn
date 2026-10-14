// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export interface LinkedTaskView {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
}

const FIELD_SEP = '\u0001'
const ITEM_SEP = '\u0002'

/**
 * メッセージに紐づくタスク一覧を文字列1つにまとめる。
 * React.memo のメッセージ行は配列だと毎回参照が変わって再描画されるため、id / status / title を連結した値で渡す。
 */
export function encodeLinkedTasksKey(tasks: readonly LinkedTaskView[]): string {
  return tasks.map(task => [task.id, task.status, task.title].join(FIELD_SEP)).join(ITEM_SEP)
}

export function decodeLinkedTasksKey(key: string): LinkedTaskView[] {
  if (!key) return []
  return key.split(ITEM_SEP).flatMap((item) => {
    const [id, status, ...title] = item.split(FIELD_SEP)
    if (!id || (status !== 'todo' && status !== 'in_progress' && status !== 'done')) return []
    return [{ id, status, title: title.join(FIELD_SEP) }]
  })
}
