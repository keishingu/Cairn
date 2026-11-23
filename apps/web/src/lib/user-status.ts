// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export type UserStatus = 'online' | 'away' | 'busy' | 'offline'

export const USER_STATUSES: UserStatus[] = ['online', 'away', 'busy', 'offline']

export const STATUS_OPTIONS: { value: UserStatus; label: string; color: string }[] = [
  { value: 'online',  label: 'Online',  color: 'var(--emerald)' },
  { value: 'away',    label: 'Away',    color: 'var(--amber)' },
  { value: 'busy',    label: 'Busy',    color: 'var(--red)' },
  { value: 'offline', label: 'Offline', color: 'var(--text-4)' },
]

export const statusLabel = (status: UserStatus | undefined) =>
  STATUS_OPTIONS.find(s => s.value === status)?.label ?? STATUS_OPTIONS[0]!.label
export const statusColor = (status: UserStatus | undefined) =>
  STATUS_OPTIONS.find(s => s.value === status)?.color ?? STATUS_OPTIONS[0]!.color
