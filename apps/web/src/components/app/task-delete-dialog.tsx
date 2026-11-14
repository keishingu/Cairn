'use client'

import React from 'react'
import { ConfirmDialog } from './confirm-dialog'
import { useDeleteTask } from '@/hooks/use-tasks'
import { formatTaskTitleForDisplay } from '@/lib/task-title-display'
import { useT } from '@/components/locale-provider'
import type { TaskDto } from '@/app/api/tasks/route'

interface TaskDeleteDialogProps {
  /** 削除対象。null のとき閉じている。 */
  task: Pick<TaskDto, 'id' | 'title'> | null
  onClose: () => void
  /** 削除に成功した直後（確認ダイアログを閉じる前）に呼ぶ。詳細パネルを閉じる用途。 */
  onDeleted?: () => void
}

// タスク削除の確認。一覧の行メニュー・チャット詳細・プロジェクトのタスクタブ・詳細パネルで共通に使う。
export const TaskDeleteDialog = ({ task, onClose, onDeleted }: TaskDeleteDialogProps) => {
  const t = useT()
  const deleteMutation = useDeleteTask()

  return (
    <ConfirmDialog
      open={task != null}
      title={t('Delete this task?')}
      message={t('This deletes "{name}". This cannot be undone.', { name: task ? formatTaskTitleForDisplay(task.title) : '' })}
      onClose={onClose}
      onConfirm={async () => {
        if (!task) return
        await deleteMutation.mutateAsync(task.id)
        onDeleted?.()
      }}
    />
  )
}
