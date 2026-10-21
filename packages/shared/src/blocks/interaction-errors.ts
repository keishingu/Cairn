// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// /api/app-interactions が返すエラーコードを、利用者に見せる文言（英語のキー。表示時に翻訳する）にする。
// Web とネイティブで同じ案内を出すため共有する

const MESSAGES: Record<string, string> = {
  app_unreachable: 'The app did not respond. Please try again.',
  app_timeout: 'The app did not respond. Please try again.',
  app_uninstalled: 'This app has been uninstalled.',
  app_not_in_channel: 'This app has been removed from this channel.',
  app_not_interactive: 'This action is no longer available.',
  action_not_found: 'This action is no longer available.',
  invalid_option: 'This action is no longer available.',
  message_not_found: 'This action is no longer available.',
  card_changed: 'This card was updated. Check it and try again.',
}

export function cardActionErrorMessage(code: string | null | undefined): string {
  return (code && MESSAGES[code]) || 'Could not send the action. Please try again.'
}
