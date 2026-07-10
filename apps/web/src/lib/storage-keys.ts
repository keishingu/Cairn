/**
 * アプリが管理する localStorage キーの一覧。
 *
 * 命名規則: `cairn:<snake_case>`
 *   - プレフィックス `cairn:` は必須（他ライブラリのキーとの衝突を防ぐ）
 *   - `:` 以降は snake_case（小文字英数字とアンダースコアのみ）
 *   - 新しいキーは必ずこのオブジェクトに追加し、インラインの文字列リテラルで書かない
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
  calendar_view:             'cairn:calendar_view',
  calendar_status_filter:    'cairn:calendar_status_filter',
  calendar_member_filter:    'cairn:calendar_member_filter',
  calendar_gcal_hidden:      'cairn:calendar_gcal_hidden',
  kanban_status_filter:      'cairn:kanban_status_filter',
  kanban_member_filter:      'cairn:kanban_member_filter',
  kanban_scope:              'cairn:kanban_scope',
  sidebar_collapsed:         'cairn:sidebar_collapsed',
  projects_list_view:        'cairn:projects_list_view',
  projects_table_sort:       'cairn:projects_table_sort',
  chat_archived_collapsed:   'cairn:chat_archived_collapsed',
  chat_completed_milestones_collapsed: 'cairn:chat_completed_milestones_collapsed',
  chat_last_channel_id:      'cairn:chat_last_channel_id',
} as const

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS]

/** チャンネル別の未送信ドラフトキー (cairn:chat_draft_<channelId>) */
export const chatDraftKey = (channelId: string) => `cairn:chat_draft_${channelId}` as const
