// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export interface CalendarIntegration {
  syncProject(params: {
    projectId: string
    title: string
    startDate: string
    endDate: string
    attendeeEmails: string[]
  }): Promise<{ externalEventId: string }>

  removeEvent(externalEventId: string): Promise<void>
}
