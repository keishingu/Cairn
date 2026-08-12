// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export type MessageCreatedEvent = {
  name: 'message/created'
  data: {
    messageId: string
    channelId: string
    workspaceId: string
    senderId: string
    senderName: string
    content: string
    attachmentFileIds: string[]
  }
}

// 既存の画像ファイルにサムネを後付け生成するバックフィル（手動トリガー）。
// 1回の実行で一定件数だけ処理し、残りがあれば自身を再送して継続する。
export type BackfillThumbnailsEvent = {
  name: 'attachments/backfill-thumbnails'
  data: {
    workspaceId?: string
    // id キーセットページネーションの起点（この id より大きい行から処理する）
    afterId?: string
  }
}

export type TaskAssignedEvent = {
  name: 'task/assigned'
  data: {
    taskId: string
    taskTitle: string
    assigneeId: string
    projectId: string
    projectTitle: string
    workspaceId: string
    assignerId: string
    assignerName: string
  }
}
