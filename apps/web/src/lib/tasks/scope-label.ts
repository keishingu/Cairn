// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { TaskDto } from '@/app/api/tasks/route'

/** タスク一覧・編集ダイアログで「どこのタスクか」を示すラベル。DM 由来は channelName が無いため専用文言を出す。 */
export function taskScopeLabel(
  task: Pick<TaskDto, 'projectTitle' | 'channelName' | 'channelType'>,
  t: (key: string) => string,
): string {
  if (task.projectTitle) return task.projectTitle
  if (task.channelType === 'dm') return t('Direct message')
  return task.channelName ?? t('No project')
}
