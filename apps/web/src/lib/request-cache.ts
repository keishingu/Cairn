// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { headers } from 'next/headers'

const requestCache = new WeakMap<object, Map<string, Promise<unknown>>>()

async function getRequestStore() {
  const requestHeaders = await headers()
  const cacheKey = requestHeaders as unknown as object

  let store = requestCache.get(cacheKey)
  if (!store) {
    store = new Map<string, Promise<unknown>>()
    requestCache.set(cacheKey, store)
  }

  return store
}

export async function getCachedForRequest<T>(
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const store = await getRequestStore()
  const cached = store.get(key) as Promise<T> | undefined
  if (cached) return cached

  const pending = loader().catch((error) => {
    store.delete(key)
    throw error
  })
  store.set(key, pending)
  return pending
}
