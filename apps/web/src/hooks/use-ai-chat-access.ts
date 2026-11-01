// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { canUseAiChat } from '@cairn/shared'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import { useWorkspaceSettings } from '@/lib/use-workspace-settings'

/**
 * 自分が /ai を使えるか。owner が決めた範囲（設定の「AIエージェント」）と自分のロールで判定する。
 * 読み込み中・読み込めないときは undefined（入口は隠さず、判定の正であるサーバーの 403 に任せる）
 */
export function useAiChatAllowed(): boolean | undefined {
  const { wsRole } = useWorkspacePermissions()
  const { data: settings } = useWorkspaceSettings()
  if (!wsRole || !settings) return undefined
  return canUseAiChat(wsRole, settings.aiChatAccess)
}
