// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export interface ChatIntegration {
  notify(params: {
    channelId: string
    message: string
  }): Promise<void>
}
