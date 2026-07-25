// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/** 返金済みのストリーム途中応答は保存して無償利用させない。 */
export function shouldPersistFinishedAssistantMessage(streamFailed: boolean): boolean {
  return !streamFailed
}
