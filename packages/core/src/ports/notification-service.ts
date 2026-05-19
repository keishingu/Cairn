// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export interface NotificationService {
  sendPush(params: {
    userIds: string[]
    title: string
    body: string
    data?: Record<string, string>
  }): Promise<void>
}
