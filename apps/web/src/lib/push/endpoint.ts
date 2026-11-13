// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/** ブラウザの Push サービス以外への送信を防ぐ。新しいサービスは明示的に追加する。 */
export function isAllowedWebPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    const host = url.hostname
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && (
      host === 'fcm.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' ||
      host === 'web.push.apple.com' || host.endsWith('.push.apple.com') ||
      host.endsWith('.notify.windows.com')
    )
  } catch {
    return false
  }
}
