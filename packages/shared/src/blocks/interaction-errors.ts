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
  channel_archived: 'Apps cannot be used in an archived channel.',
  user_not_found: 'You can no longer use this workspace.',
  channel_unavailable: 'This form can no longer be submitted to this channel.',
  view_changed: 'This form was updated by the app. Check the content and submit again.',
  view_submitting: 'This form is already being submitted.',
  view_not_found: 'This form is no longer available.',
  app_invalid_response: 'The app returned an invalid response.',
  card_changed: 'This card was updated. Check it and try again.',
}

export function cardActionErrorMessage(code: string | null | undefined): string {
  return (code && MESSAGES[code]) || 'Could not send the action. Please try again.'
}

// モーダルの入力欄ごとのエラー。Cairn の検証はコード、アプリが返した文言はそのまま出す
const FIELD_MESSAGES: Record<string, string> = {
  required: 'Please fill in this field.',
  too_short: 'This is too short.',
  too_long: 'This is too long.',
  invalid_option: 'Choose one of the options.',
}

export function viewFieldErrorMessage(error: { code?: string; message?: string }, translate: (key: string) => string): string {
  if (error.message) return error.message
  return translate((error.code && FIELD_MESSAGES[error.code]) || 'Please check this field.')
}

/**
 * Bot をチャンネルへ追加する API（/api/channels/[channelId]/apps）の失敗を、利用者に見せる文言（英語のキー）にする。
 * 本文の日本語メッセージは表示言語に従わないため使わず、状態コードで決める
 */
export function appAddErrorMessage(status: number): string {
  if (status === 403) return 'You do not have permission to add apps to this channel.'
  if (status === 404) return 'This app has been uninstalled.'
  if (status === 422) return 'Apps cannot be added to this channel.'
  return 'Could not add the app. Please try again.'
}
