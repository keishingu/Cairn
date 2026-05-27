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

export type TaskAssignedEvent = {
  name: 'task/assigned'
  data: {
    taskId: string
    taskTitle: string
    assigneeId: string
    projectId: string
    projectTitle: string
    workspaceId: string
    assignerName: string
  }
}
