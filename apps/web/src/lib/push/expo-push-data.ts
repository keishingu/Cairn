// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export interface ExpoPushDataInput {
  url?: string | undefined
  workspaceId?: string | undefined
}

/** Expo の data に載せる遷移先。Web Push のバッジ用フィールドは含めない。 */
export function expoPushData(payload: ExpoPushDataInput): Record<string, string> | undefined {
  const data: Record<string, string> = {}
  if (payload.url) data['url'] = payload.url
  if (payload.workspaceId) data['workspaceId'] = payload.workspaceId
  return Object.keys(data).length > 0 ? data : undefined
}
