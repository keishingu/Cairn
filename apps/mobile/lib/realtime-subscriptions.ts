// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/** Keep unchanged subscriptions alive when the channel list is refreshed. */
export function reconcileRealtimeSubscriptions<T>(
  current: Map<string, T>,
  wanted: ReadonlySet<string>,
  subscribe: (id: string) => T,
  remove: (subscription: T, id: string) => void,
  start: (subscription: T, id: string) => void = () => {},
) {
  for (const [id, subscription] of current) {
    if (!wanted.has(id)) {
      current.delete(id)
      remove(subscription, id)
    }
  }
  for (const id of wanted) {
    if (!current.has(id)) {
      const subscription = subscribe(id)
      current.set(id, subscription)
      start(subscription, id)
    }
  }
}
