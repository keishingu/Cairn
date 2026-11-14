// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/** ブラウザの Push サービス以外への送信を防ぐ。新しいサービスは明示的に追加する。 */
export function normalizeWebPushEndpoint(endpoint: string): string | null {
  try {
    const url = new URL(endpoint)
    const host = url.hostname
    const allowed = url.protocol === 'https:' && !url.username && !url.password && !url.port && (
      host === 'fcm.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' ||
      host === 'web.push.apple.com' || host.endsWith('.push.apple.com') ||
      host.endsWith('.notify.windows.com')
    )
    return allowed ? url.href : null
  } catch {
    return null
  }
}
