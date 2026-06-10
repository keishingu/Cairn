/**
 * アプリが管理する localStorage キーの一覧。
 * 命名規則: `cairn:<snake_case>` （詳細は CLAUDE.md 参照）
 *
 * ※ next-themes が設定する `theme` キーはライブラリ管理のため対象外。
 */
export const STORAGE_KEYS = {
  accent:                    'cairn:accent',
  projects_view_pc:          'cairn:projects_view_pc',
  projects_view_mob:         'cairn:projects_view_mobile',
  projects_filter:           'cairn:projects_filter',
  projects_status_filter:    'cairn:projects_status_filter',
  projects_member_filter:    'cairn:projects_member_filter',
  calendar_status_filter:    'cairn:calendar_status_filter',
  calendar_member_filter:    'cairn:calendar_member_filter',
  calendar_gcal_hidden:      'cairn:calendar_gcal_hidden',
  kanban_status_filter:      'cairn:kanban_status_filter',
  kanban_member_filter:      'cairn:kanban_member_filter',
  kanban_scope:              'cairn:kanban_scope',
  sidebar_collapsed:         'cairn:sidebar_collapsed',
  projects_list_view:        'cairn:projects_list_view',
  projects_table_sort:       'cairn:projects_table_sort',
} as const

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS]

/** チャンネル別の未送信ドラフトキー (cairn:chat_draft_<channelId>) */
export const chatDraftKey = (channelId: string) => `cairn:chat_draft_${channelId}` as const
